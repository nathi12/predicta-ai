// lib/slipTracking.ts
// Log the app's canonical preset slips once a day (from the grade cron), then
// grade them against the final scores. Powers the "Bet-slip record" on /accuracy.
// Mirrors lib/tracking.ts; storage is the shared KV store.
//
// The record is only honest if it's independent of traffic and settles at prices
// a bettor could actually get: one slip per preset per UTC day, built only from
// selections with live bookmaker odds, and settled at those odds.
//
// Like lib/tracking.ts, the aggregates are read-modify-write JSON, written only
// by the grade cron under its cross-instance lock.

import 'server-only';
import { store } from '@/lib/kv';
import { log } from '@/lib/log';
import { round2, round3 } from '@/lib/num';
import { MODEL_VERSION } from '@/lib/prediction';
import { buildSlip } from '@/lib/slip/build';
import { enumerateSelections } from '@/lib/slip/selections';
import { SLIP_PRESETS, type BetSlip } from '@/lib/slip/types';
import type {
    FixtureOdds,
    GradedSlip,
    MatchWithPrediction,
    SlipLeg,
    SlipLegResult,
    SlipMarketStat,
    SlipRecord,
    SlipRollingStats,
} from '@/types';

const PENDING_SET = 'slip:pending';
const RECENT_KEY = 'slip:recent';
// v2: one slip per preset per day, book odds only. The v1 aggregate (logged per
// page view, partly settled at fair odds) is left in place but no longer read.
const STATS_KEY = 'stats:slips:rolling:v2';
const slipKey = (id: string) => `slip:${id}`;
const resultKey = (id: string) => `result:slip:${id}`;
const SLIP_TTL = 45 * 24 * 60 * 60;
const RESULT_TTL = 120 * 24 * 60 * 60;


/** Markets whose outcome can be read off a final score. Corners cannot. */
const GRADABLE = new Set([
    'home',
    'away',
    'draw',
    'dc1x',
    'dcx2',
    'dc12',
    'over15',
    'over25',
    'over35',
    'btts',
]);

// --- write path -------------------------------------------------------

function toRecord(
    presetId: string,
    mode: SlipRecord['mode'],
    slip: BetSlip,
    day: string,
): SlipRecord {
    const legs: SlipLeg[] = slip.legs.map((l) => ({
        matchId: l.matchId,
        league: l.league,
        kickoff: l.kickoff,
        home: l.homeTeam,
        away: l.awayTeam,
        market: l.market,
        pick: l.pick,
        modelProbability: round3(l.modelProbability),
        bookOdds: l.bookOdds != null ? round2(l.bookOdds) : null,
        oddsSource: l.oddsSource,
    }));
    return {
        slipId: `${presetId}:${day}`,
        presetId,
        mode,
        legs,
        combinedModelProbability: round3(slip.combinedModelProbability),
        combinedFairOdds: round2(slip.combinedFairOdds),
        combinedBookOdds: slip.combinedBookOdds != null ? round2(slip.combinedBookOdds) : null,
        modelVersion: MODEL_VERSION,
        createdAt: new Date().toISOString(),
        day,
    };
}

/**
 * Log a slip and mark it pending grading. The first slip logged for a preset on
 * a given day wins — later calls (a manual cron re-run) are no-ops.
 */
export async function recordSlip(record: SlipRecord): Promise<boolean> {
    const claim = await store.incr(`slip:claim:${record.slipId}`, SLIP_TTL);
    if (claim !== 1) return false;
    await store.set(slipKey(record.slipId), record, SLIP_TTL);
    await store.sadd(PENDING_SET, record.slipId);
    return true;
}

/**
 * Build every canonical preset slip from today's fixtures and log it. Only
 * selections priced at live book odds are eligible, so every logged slip settles
 * at a price that was actually on offer. Returns how many slips were logged.
 */
export async function recordPresetSlips(
    matches: MatchWithPrediction[],
    odds: Record<string, FixtureOdds>,
    now = new Date(),
): Promise<number> {
    const day = now.toISOString().slice(0, 10);
    const priced = matches.filter((m) => odds[m.match.id] != null);
    let recorded = 0;
    for (const preset of SLIP_PRESETS) {
        try {
            const req = preset.request;
            const selections = enumerateSelections(
                priced,
                odds,
                req,
                req.mode === 'single-market' ? { onlyMarket: req.market, now } : { now },
            ).filter((s) => s.bookOdds != null);
            const slip = buildSlip(selections, req);
            if (slip.legs.length < 2 || slip.combinedBookOdds == null) continue;
            if (slip.legs.some((l) => !l.autoGradable)) continue; // keep the record corners-free
            if (await recordSlip(toRecord(preset.id, req.mode, slip, day))) recorded++;
        } catch (err) {
            log.warn(`recordPresetSlips ${preset.id} failed`, (err as Error).message);
        }
    }
    return recorded;
}

export async function pendingSlipIds(): Promise<string[]> {
    return store.smembers(PENDING_SET);
}

export async function getSlip(id: string): Promise<SlipRecord | null> {
    return store.get<SlipRecord>(slipKey(id));
}

/** Many slip records in one round trip, in order; null where expired. */
export async function getSlips(ids: string[]): Promise<Array<SlipRecord | null>> {
    return store.mget<SlipRecord>(ids.map(slipKey));
}

/** Drop a slip from the grading queue without grading it (record gone, leg void). */
export async function discardPendingSlip(id: string): Promise<void> {
    await store.srem(PENDING_SET, id);
}

// --- grade path ------------------------------------------------------

/** Whether a leg in `market` landed, given the final score. Unknown markets miss. */
export function legHit(market: string, fh: number, fa: number): boolean {
    const total = fh + fa;
    const res = fh > fa ? 'home' : fh === fa ? 'draw' : 'away';
    switch (market) {
        case 'home':
            return res === 'home';
        case 'away':
            return res === 'away';
        case 'draw':
            return res === 'draw';
        case 'dc1x':
            return res !== 'away';
        case 'dcx2':
            return res !== 'home';
        case 'dc12':
            return res !== 'draw';
        case 'over15':
            return total > 1.5;
        case 'over25':
            return total > 2.5;
        case 'over35':
            return total > 3.5;
        case 'btts':
            return fh > 0 && fa > 0;
        default:
            return false;
    }
}

/**
 * Grade one slip once every leg's match has finished. Returns null if it isn't
 * gradable, or if another run already graded it.
 */
export async function gradeSlip(
    record: SlipRecord,
    finals: Map<string, { home: number; away: number }>,
): Promise<GradedSlip | null> {
    // Legacy per-view records and anything without a real price never settle
    // into the record — a fair-odds payout carries no bookmaker margin.
    if (
        !record.day ||
        record.combinedBookOdds == null ||
        record.legs.some((l) => !GRADABLE.has(l.market))
    ) {
        await store.srem(PENDING_SET, record.slipId);
        return null;
    }
    const claim = await store.incr(`slip:graded:${record.slipId}`, RESULT_TTL);
    if (claim !== 1) {
        await store.srem(PENDING_SET, record.slipId);
        return null;
    }

    const legResults: SlipLegResult[] = record.legs.map((l) => {
        const f = finals.get(l.matchId);
        return {
            matchId: l.matchId,
            home: l.home,
            away: l.away,
            market: l.market,
            pick: l.pick,
            hit: !!f && legHit(l.market, f.home, f.away),
            score: f ? { home: f.home, away: f.away } : undefined,
        };
    });
    const won = legResults.every((r) => r.hit);
    const payoutMultiple = won ? record.combinedBookOdds : 0;

    const graded: GradedSlip = {
        slipId: record.slipId,
        presetId: record.presetId,
        gradedAt: new Date().toISOString(),
        legResults,
        won,
        combinedBookOdds: record.combinedBookOdds,
        payoutMultiple,
    };

    await store.set(resultKey(record.slipId), graded, RESULT_TTL);
    await store.srem(PENDING_SET, record.slipId);
    await foldIntoRolling(record, graded);
    await pushRecentSlip(record.slipId);
    return graded;
}

const emptyStat = (): SlipMarketStat => ({ n: 0, won: 0, staked: 0, returned: 0 });

async function foldIntoRolling(record: SlipRecord, graded: GradedSlip): Promise<void> {
    const stats: SlipRollingStats = (await store.get<SlipRollingStats>(STATS_KEY)) ?? {
        updatedAt: new Date().toISOString(),
        overall: emptyStat(),
        byPreset: {},
    };

    const apply = (s: SlipMarketStat) => {
        s.n += 1;
        s.won += graded.won ? 1 : 0;
        s.staked += 1;
        s.returned += graded.payoutMultiple;
    };

    apply(stats.overall);
    const perPreset = stats.byPreset[record.presetId] ?? emptyStat();
    apply(perPreset);
    stats.byPreset[record.presetId] = perPreset;
    stats.updatedAt = new Date().toISOString();

    await store.set(STATS_KEY, stats);
}

// --- read path ------------------------------------------------------

export async function getSlipStats(): Promise<SlipRollingStats | null> {
    return store.get<SlipRollingStats>(STATS_KEY);
}

export async function pushRecentSlip(id: string): Promise<void> {
    const ids = (await store.get<string[]>(RECENT_KEY)) ?? [];
    const next = [id, ...ids.filter((x) => x !== id)].slice(0, 40);
    await store.set(RECENT_KEY, next);
}

export async function recentSlips(
    limit = 12,
): Promise<Array<GradedSlip & { record: SlipRecord | null }>> {
    const ids = ((await store.get<string[]>(RECENT_KEY)) ?? []).slice(0, limit);
    if (ids.length === 0) return [];
    const [results, records] = await Promise.all([
        store.mget<GradedSlip>(ids.map(resultKey)),
        getSlips(ids),
    ]);
    const out: Array<GradedSlip & { record: SlipRecord | null }> = [];
    results.forEach((res, i) => {
        if (res) out.push({ ...res, record: records[i] });
    });
    return hydrateLegs(out);
}

/**
 * Fill in any leg still missing team names or a final score. New slips store both
 * at grade time; older ones fall back to their SlipRecord and, for the score, to
 * the match's own graded prediction result (`result:{matchId}`) — fetched for
 * every slip in one round trip.
 */
async function hydrateLegs<S extends GradedSlip & { record: SlipRecord | null }>(
    slips: S[],
): Promise<S[]> {
    const missing = [
        ...new Set(
            slips.flatMap((s) => s.legResults.filter((l) => l.score == null).map((l) => l.matchId)),
        ),
    ];
    const finals = new Map<string, { home: number; away: number }>();
    if (missing.length > 0) {
        const graded = await store.mget<{ finalScore?: { home: number; away: number } }>(
            missing.map((id) => `result:${id}`),
        );
        graded.forEach((g, i) => {
            if (g?.finalScore) finals.set(missing[i], g.finalScore);
        });
    }
    return slips.map((s) => ({
        ...s,
        legResults: s.legResults.map((leg, i) => {
            if (leg.home && leg.score) return leg;
            const recLeg = s.record?.legs[i];
            return {
                ...leg,
                home: leg.home ?? recLeg?.home,
                away: leg.away ?? recLeg?.away,
                market: leg.market ?? recLeg?.market,
                score: leg.score ?? finals.get(leg.matchId),
            };
        }),
    }));
}
