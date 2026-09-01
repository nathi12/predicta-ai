// lib/tracking.ts
// Persist every prediction, then grade it against the final score. Powers the
// /accuracy page. Storage is the shared KV store.

import 'server-only';
import { store } from '@/lib/kv';
import { hasApiFootball } from '@/lib/env';
import { recordTeamCorners } from '@/lib/cornerRates';
import type {
    EnrichedMatch,
    GradedResult,
    LeagueCode,
    MarketStat,
    MatchPrediction,
    RollingStats,
    TrackedPrediction,
} from '@/types';

const PENDING_SET = 'pred:pending';
// Predictions whose score is in but whose corners still need an API-Football
// stats call. Drained by the grade cron, budget permitting.
const CORNERS_PENDING_SET = 'pred:corners:pending';
const predKey = (id: string) => `pred:${id}`;
const resultKey = (id: string) => `result:${id}`;

/** Upsert a prediction and mark it pending grading. Idempotent. */
export async function recordPrediction(
    match: EnrichedMatch,
    prediction: MatchPrediction,
): Promise<void> {
    // Don't overwrite a prediction we've already graded.
    const graded = await store.get<GradedResult>(resultKey(match.id));
    if (graded) return;

    const record: TrackedPrediction = {
        matchId: match.id,
        league: match.league,
        kickoff: match.kickoff,
        home: match.home.team.shortName,
        away: match.away.team.shortName,
        outcome: prediction.outcome,
        predictedScore: prediction.predictedScore,
        markets: {
            over15: prediction.markets.over15.probability,
            over25: prediction.markets.over25.probability,
            over35: prediction.markets.over35.probability,
            btts: prediction.markets.btts.probability,
            corners95: prediction.markets.corners?.over95.probability,
            corners105: prediction.markets.corners?.over105.probability,
        },
        apiFootballFixtureId: match.apiFootballFixtureId,
        modelVersion: prediction.modelVersion,
        createdAt: new Date().toISOString(),
    };

    const existing = await store.get<TrackedPrediction>(predKey(match.id));
    if (existing) {
        // Keep the earliest createdAt so "lead time" stays honest.
        record.createdAt = existing.createdAt;
        // Don't lose an id resolved by an earlier build when this one ran with
        // no API-Football budget — it's what lets us grade corners later.
        if (record.apiFootballFixtureId == null) {
            record.apiFootballFixtureId = existing.apiFootballFixtureId;
        }
    }

    await store.set(predKey(match.id), record, 45 * 24 * 60 * 60);
    await store.sadd(PENDING_SET, match.id);
}

export async function pendingMatchIds(): Promise<string[]> {
    return store.smembers(PENDING_SET);
}

export async function getTracked(id: string): Promise<TrackedPrediction | null> {
    return store.get<TrackedPrediction>(predKey(id));
}

/** Grade one prediction against its final score and fold it into rolling stats. */
export async function gradePrediction(
    tracked: TrackedPrediction,
    finalHome: number,
    finalAway: number,
): Promise<GradedResult> {
    const actualOutcome =
        finalHome > finalAway ? 'home' : finalHome === finalAway ? 'draw' : 'away';
    const picked = (['home', 'draw', 'away'] as const).reduce((a, b) =>
        tracked.outcome[a] >= tracked.outcome[b] ? a : b,
    );

    const totalGoals = finalHome + finalAway;
    const btts = finalHome > 0 && finalAway > 0;

    const p = tracked.outcome;
    const y = {
        home: actualOutcome === 'home' ? 1 : 0,
        draw: actualOutcome === 'draw' ? 1 : 0,
        away: actualOutcome === 'away' ? 1 : 0,
    };
    const brier1x2 =
        (p.home - y.home) ** 2 + (p.draw - y.draw) ** 2 + (p.away - y.away) ** 2;

    const result: GradedResult = {
        matchId: tracked.matchId,
        league: tracked.league,
        finalScore: { home: finalHome, away: finalAway },
        gradedAt: new Date().toISOString(),
        hits: {
            outcome: picked === actualOutcome,
            over15: (tracked.markets.over15 >= 0.5) === totalGoals > 1.5,
            over25: (tracked.markets.over25 >= 0.5) === totalGoals > 2.5,
            btts: (tracked.markets.btts >= 0.5) === btts,
        },
        brier1x2,
    };

    await store.set(resultKey(tracked.matchId), result, 120 * 24 * 60 * 60);
    await store.srem(PENDING_SET, tracked.matchId);
    await foldIntoRolling(tracked, result);

    // Corners need a separate API-Football stats call — defer to the cron's
    // budget-capped pass rather than block grading on it.
    if (hasApiFootball() && tracked.apiFootballFixtureId && tracked.markets.corners95 != null) {
        await store.sadd(CORNERS_PENDING_SET, tracked.matchId);
    }

    return result;
}

// --- corners (deferred second pass) ---------------------------------------

export async function pendingCornerIds(): Promise<string[]> {
    return store.smembers(CORNERS_PENDING_SET);
}

/** Drop a match from the corners queue without grading it (id gone, expired). */
export async function discardPendingCorner(matchId: string): Promise<void> {
    await store.srem(CORNERS_PENDING_SET, matchId);
}

/**
 * Grade the corners markets for an already-scored prediction against real corner
 * counts, fold the hit/miss into the rolling aggregate, and fold each side's
 * count into its rolling corner-rate history. All of it runs past one
 * idempotency gate, so a match is only ever counted once. The match leaves the
 * queue whether or not it could be graded.
 */
export async function gradeCorners(
    matchId: string,
    totalCorners: number,
    byTeamId?: Record<number, number>,
): Promise<boolean> {
    const [tracked, result] = await Promise.all([
        getTracked(matchId),
        store.get<GradedResult>(resultKey(matchId)),
    ]);
    if (!tracked || !result || tracked.markets.corners95 == null || tracked.markets.corners105 == null) {
        await store.srem(CORNERS_PENDING_SET, matchId);
        return false;
    }
    // Already graded (e.g. a duplicate queue entry) — don't double-count.
    if (result.hits.corners95 != null) {
        await store.srem(CORNERS_PENDING_SET, matchId);
        return false;
    }

    const hit95 = (tracked.markets.corners95 >= 0.5) === totalCorners > 9.5;
    const hit105 = (tracked.markets.corners105 >= 0.5) === totalCorners > 10.5;
    result.hits.corners95 = hit95;
    result.hits.corners105 = hit105;
    await store.set(resultKey(matchId), result, 120 * 24 * 60 * 60);

    const stats = (await store.get<RollingStats>('stats:rolling')) ?? emptyRolling();
    if (!stats.corners95) stats.corners95 = emptyStat();
    if (!stats.corners105) stats.corners105 = emptyStat();
    stats.corners95.n += 1;
    stats.corners95.hits += hit95 ? 1 : 0;
    stats.corners105.n += 1;
    stats.corners105.hits += hit105 ? 1 : 0;
    stats.updatedAt = new Date().toISOString();
    await store.set('stats:rolling', stats);

    if (byTeamId) await recordTeamCorners(byTeamId).catch(() => {});

    await store.srem(CORNERS_PENDING_SET, matchId);
    return true;
}

// --- rolling aggregate ------------------------------------------------

const emptyStat = (): MarketStat => ({ n: 0, hits: 0, brier: 0 });

function emptyRolling(): RollingStats {
    return {
        updatedAt: new Date().toISOString(),
        window: 'all',
        outcome: emptyStat(),
        over15: emptyStat(),
        over25: emptyStat(),
        btts: emptyStat(),
        corners95: emptyStat(),
        corners105: emptyStat(),
        calibration: Array.from({ length: 10 }, (_, i) => ({
            bin: i,
            predicted: 0,
            actual: 0,
            n: 0,
        })),
        byLeague: {},
    };
}

async function foldIntoRolling(tracked: TrackedPrediction, r: GradedResult): Promise<void> {
    const stats = (await store.get<RollingStats>('stats:rolling')) ?? emptyRolling();
    // over15 was added after the first grades landed — older aggregates lack it.
    if (!stats.over15) stats.over15 = emptyStat();

    stats.outcome.n += 1;
    stats.outcome.hits += r.hits.outcome ? 1 : 0;
    stats.outcome.brier += r.brier1x2;

    stats.over15.n += 1;
    stats.over15.hits += r.hits.over15 ? 1 : 0;

    stats.over25.n += 1;
    stats.over25.hits += r.hits.over25 ? 1 : 0;

    stats.btts.n += 1;
    stats.btts.hits += r.hits.btts ? 1 : 0;

    const fav = Math.max(tracked.outcome.home, tracked.outcome.draw, tracked.outcome.away);
    const bin = Math.min(9, Math.floor(fav * 10));
    const cal = stats.calibration[bin];
    cal.n += 1;
    cal.predicted += fav;
    cal.actual += r.hits.outcome ? 1 : 0;

    const lg = (stats.byLeague[tracked.league] ?? emptyStat()) as MarketStat;
    lg.n += 1;
    lg.hits += r.hits.outcome ? 1 : 0;
    lg.brier += r.brier1x2;
    stats.byLeague[tracked.league as LeagueCode] = lg;

    stats.updatedAt = new Date().toISOString();
    await store.set('stats:rolling', stats);
}

export async function getRollingStats(): Promise<RollingStats | null> {
    return store.get<RollingStats>('stats:rolling');
}

export async function recentResults(limit = 20): Promise<Array<GradedResult & { tracked: TrackedPrediction | null }>> {
    // Best-effort: we don't keep an ordered list, so scan pending-adjacent keys
    // is not possible; instead maintain a capped recent list.
    const ids = (await store.get<string[]>('result:recent')) ?? [];
    const out: Array<GradedResult & { tracked: TrackedPrediction | null }> = [];
    for (const id of ids.slice(0, limit)) {
        const res = await store.get<GradedResult>(resultKey(id));
        if (res) out.push({ ...res, tracked: await getTracked(id) });
    }
    return out;
}

export async function pushRecent(id: string): Promise<void> {
    const ids = (await store.get<string[]>('result:recent')) ?? [];
    const next = [id, ...ids.filter((x) => x !== id)].slice(0, 50);
    await store.set('result:recent', next);
}
