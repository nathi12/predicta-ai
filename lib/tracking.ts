// lib/tracking.ts
// Persist every prediction, then grade it against the final score. Powers the
// /accuracy page. Storage is the shared KV store; the arithmetic is in
// lib/grading.ts.
//
// Every graded match is folded into three aggregates — all-time, its model
// version, and its kickoff day (summed into "last 90 days" on read). They're
// read-modify-write JSON, which is safe because the grade cron is their only
// writer and holds a cross-instance lock for the whole run (see
// app/api/cron/grade/route.ts).

import 'server-only';
import { store } from '@/lib/kv';
import { hasApiFootball } from '@/lib/env';
import { foldFixtureCorners } from '@/lib/cornerRates';
import { MODEL_VERSION } from '@/lib/prediction';
import {
    cornerHits,
    emptyRolling,
    foldCorners,
    foldResult,
    gradeResult,
    impliedProbabilities,
    mergeStats,
} from '@/lib/grading';
import type {
    EnrichedMatch,
    FixtureOdds,
    GradedResult,
    MarketSnapshot,
    MatchPrediction,
    RollingStats,
    TrackedPrediction,
} from '@/types';

const PENDING_SET = 'pred:pending';
// Predictions whose score is in but whose corners still need an API-Football
// stats call. Drained by the grade cron, budget permitting.
const CORNERS_PENDING_SET = 'pred:corners:pending';
const predKey = (id: string) => `pred:${id}`;
const marketKey = (id: string) => `pred:market:${id}`;
const resultKey = (id: string) => `result:${id}`;

const PRED_TTL = 45 * 24 * 60 * 60;

// Aggregates. A day bucket outlives the 90-day window it feeds.
const ALL_KEY = 'stats:rolling';
const modelKey = (version: string) => `stats:model:${version}`;
const dayKey = (day: string) => `stats:day:${day}`;
const DAY_TTL = 100 * 24 * 60 * 60;
const WINDOW_DAYS = 90;

export type StatsView = 'all' | 'model' | '90d';

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
        apiFootballHomeId: match.apiFootballHomeId,
        apiFootballAwayId: match.apiFootballAwayId,
        raw: prediction.raw,
        modelVersion: prediction.modelVersion,
        createdAt: new Date().toISOString(),
    };

    const existing = await store.get<TrackedPrediction>(predKey(match.id));
    if (existing) {
        // Keep the earliest createdAt so "lead time" stays honest.
        record.createdAt = existing.createdAt;
        // Don't lose ids resolved by an earlier build when this one ran with
        // no API-Football budget — they're what let us grade corners later.
        if (record.apiFootballFixtureId == null) {
            record.apiFootballFixtureId = existing.apiFootballFixtureId;
        }
        if (record.apiFootballHomeId == null) {
            record.apiFootballHomeId = existing.apiFootballHomeId;
            record.apiFootballAwayId = existing.apiFootballAwayId;
        }
    }

    await store.set(predKey(match.id), record, PRED_TTL);
    await store.sadd(PENDING_SET, match.id);
}

/**
 * Log the bookmaker market's implied probabilities for upcoming fixtures, keyed
 * by match id. Called by every odds build, so the latest pre-kickoff price wins
 * and the logged line ends up close to the closing one. Separate keys from the
 * predictions so the slate build and the odds build never overwrite each other.
 */
export async function recordMarketOdds(odds: Record<string, FixtureOdds>): Promise<number> {
    let logged = 0;
    for (const [matchId, fixtureOdds] of Object.entries(odds)) {
        const snapshot = impliedProbabilities(fixtureOdds);
        if (!snapshot) continue;
        await store.set(marketKey(matchId), snapshot, PRED_TTL);
        logged++;
    }
    return logged;
}

/** Logged market snapshots in one round trip, in order; null where none was logged. */
export async function getMarketMany(ids: string[]): Promise<Array<MarketSnapshot | null>> {
    return store.mget<MarketSnapshot>(ids.map(marketKey));
}

export async function pendingMatchIds(): Promise<string[]> {
    return store.smembers(PENDING_SET);
}

export async function getTracked(id: string): Promise<TrackedPrediction | null> {
    return store.get<TrackedPrediction>(predKey(id));
}

/** Many tracked predictions in one round trip, in order; null where expired. */
export async function getTrackedMany(ids: string[]): Promise<Array<TrackedPrediction | null>> {
    return store.mget<TrackedPrediction>(ids.map(predKey));
}

/** Drop a match from the grading queue without grading it (record gone, match void). */
export async function discardPending(matchId: string): Promise<void> {
    await store.srem(PENDING_SET, matchId);
}

const RESULT_TTL = 120 * 24 * 60 * 60;

/**
 * Apply `fold` to each aggregate a tracked match belongs to: all-time, its model
 * version, and its kickoff day.
 */
async function foldEverywhere(
    tracked: TrackedPrediction,
    fold: (stats: RollingStats) => void,
): Promise<void> {
    const buckets: Array<[string, () => RollingStats, number | undefined]> = [
        [ALL_KEY, () => emptyRolling('all'), undefined],
        [modelKey(tracked.modelVersion), () => emptyRolling('model', tracked.modelVersion), undefined],
        [dayKey(tracked.kickoff.slice(0, 10)), () => emptyRolling('day'), DAY_TTL],
    ];
    for (const [key, init, ttl] of buckets) {
        const stats = (await store.get<RollingStats>(key)) ?? init();
        fold(stats);
        await store.set(key, stats, ttl);
    }
}

/**
 * Grade one prediction against its final score and fold it into the aggregates,
 * with the market's logged pre-kickoff probabilities when there are some.
 * Returns null when another run already graded it — the atomic claim keeps an
 * overlapping cron or manual trigger from counting a match twice.
 */
export async function gradePrediction(
    tracked: TrackedPrediction,
    finalHome: number,
    finalAway: number,
    market?: MarketSnapshot | null,
): Promise<GradedResult | null> {
    const claim = await store.incr(`graded:${tracked.matchId}`, RESULT_TTL);
    if (claim !== 1) {
        await store.srem(PENDING_SET, tracked.matchId);
        return null;
    }

    const result = gradeResult(tracked, finalHome, finalAway);
    await store.set(resultKey(tracked.matchId), result, RESULT_TTL);
    await store.srem(PENDING_SET, tracked.matchId);
    await foldEverywhere(tracked, (stats) => foldResult(stats, tracked, result, market));

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
    const hits = tracked ? cornerHits(tracked, totalCorners) : null;
    if (!tracked || !result || !hits) {
        await store.srem(CORNERS_PENDING_SET, matchId);
        return false;
    }
    // Already graded (e.g. a duplicate queue entry) — don't double-count.
    if (result.hits.corners95 != null) {
        await store.srem(CORNERS_PENDING_SET, matchId);
        return false;
    }

    result.hits.corners95 = hits.corners95;
    result.hits.corners105 = hits.corners105;
    await store.set(resultKey(matchId), result, RESULT_TTL);
    await foldEverywhere(tracked, (stats) => foldCorners(stats, tracked, totalCorners));

    // Fold each side's count into the venue-split rate history — once per
    // fixture, shared with the backfill path via foldFixtureCorners' own gate.
    if (byTeamId && tracked.apiFootballFixtureId) {
        await foldFixtureCorners(
            tracked.apiFootballFixtureId,
            byTeamId,
            tracked.apiFootballHomeId,
            tracked.apiFootballAwayId,
        ).catch(() => false);
    }

    await store.srem(CORNERS_PENDING_SET, matchId);
    return true;
}

// --- reading the aggregates -----------------------------------------------

/**
 * One view of the record: all-time, the live model version only, or the last
 * 90 days of kickoffs (day buckets summed on read). Null before anything in
 * that view was graded.
 */
export async function getRollingStats(view: StatsView = 'all', now = new Date()): Promise<RollingStats | null> {
    if (view === 'all') return store.get<RollingStats>(ALL_KEY);
    if (view === 'model') return store.get<RollingStats>(modelKey(MODEL_VERSION));
    const days = Array.from({ length: WINDOW_DAYS }, (_, i) =>
        new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10),
    );
    const buckets = await store.mget<RollingStats>(days.map(dayKey));
    return mergeStats('90d', buckets.filter((b): b is RollingStats => b != null));
}

/** The most recently graded predictions, newest first (from a capped id list). */
export async function recentResults(limit = 20): Promise<Array<GradedResult & { tracked: TrackedPrediction | null }>> {
    const ids = ((await store.get<string[]>('result:recent')) ?? []).slice(0, limit);
    if (ids.length === 0) return [];
    const [results, tracked] = await Promise.all([
        store.mget<GradedResult>(ids.map(resultKey)),
        getTrackedMany(ids),
    ]);
    const out: Array<GradedResult & { tracked: TrackedPrediction | null }> = [];
    results.forEach((res, i) => {
        if (res) out.push({ ...res, tracked: tracked[i] });
    });
    return out;
}

export async function pushRecent(id: string): Promise<void> {
    const ids = (await store.get<string[]>('result:recent')) ?? [];
    const next = [id, ...ids.filter((x) => x !== id)].slice(0, 50);
    await store.set('result:recent', next);
}
