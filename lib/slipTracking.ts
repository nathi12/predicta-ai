// lib/slipTracking.ts
// Persist the app's canonical preset slips when they're shown, then grade them
// against the final scores. Powers the "Bet-slip record" on /accuracy. Mirrors
// lib/tracking.ts; storage is the shared KV store.

import 'server-only';
import { createHash } from 'node:crypto';
import { store } from '@/lib/kv';
import { log } from '@/lib/log';
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
const STATS_KEY = 'stats:slips:rolling';
const slipKey = (id: string) => `slip:${id}`;
const resultKey = (id: string) => `result:slip:${id}`;

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const round2 = (x: number) => Math.round(x * 100) / 100;

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

function toRecord(presetId: string, mode: SlipRecord['mode'], slip: BetSlip): SlipRecord {
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
    const signature = legs
        .map((l) => `${l.matchId}:${l.market}`)
        .sort()
        .join('|');
    const slipId = `${presetId}:${createHash('sha1').update(signature).digest('hex').slice(0, 12)}`;
    return {
        slipId,
        presetId,
        mode,
        legs,
        combinedModelProbability: round3(slip.combinedModelProbability),
        combinedFairOdds: round2(slip.combinedFairOdds),
        combinedBookOdds: slip.combinedBookOdds != null ? round2(slip.combinedBookOdds) : null,
        modelVersion: MODEL_VERSION,
        createdAt: new Date().toISOString(),
    };
}

/** Upsert a slip and mark it pending grading. Idempotent per distinct leg set. */
export async function recordSlip(record: SlipRecord): Promise<void> {
    const graded = await store.get<GradedSlip>(resultKey(record.slipId));
    if (graded) return;

    const existing = await store.get<SlipRecord>(slipKey(record.slipId));
    if (existing) record.createdAt = existing.createdAt; // keep the earliest

    await store.set(slipKey(record.slipId), record, 45 * 24 * 60 * 60);
    await store.sadd(PENDING_SET, record.slipId);
}

/** Build every canonical preset slip from the current fixtures and log it. */
export async function recordPresetSlips(
    matches: MatchWithPrediction[],
    odds: Record<string, FixtureOdds>,
): Promise<void> {
    for (const preset of SLIP_PRESETS) {
        try {
            const req = preset.request;
            const selections = enumerateSelections(
                matches,
                odds,
                req,
                req.mode === 'single-market' ? { onlyMarket: req.market } : {},
            );
            const slip = buildSlip(selections, req);
            if (slip.legs.length < 2) continue;
            if (slip.legs.some((l) => !l.autoGradable)) continue; // keep the record corners-free
            await recordSlip(toRecord(preset.id, req.mode, slip));
        } catch (err) {
            log.warn(`recordPresetSlips ${preset.id} failed`, (err as Error).message);
        }
    }
}

export async function pendingSlipIds(): Promise<string[]> {
    return store.smembers(PENDING_SET);
}

export async function getSlip(id: string): Promise<SlipRecord | null> {
    return store.get<SlipRecord>(slipKey(id));
}

// --- grade path ------------------------------------------------------

function legHit(market: string, fh: number, fa: number): boolean {
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

/** Grade one slip once every leg's match has finished. Returns null if it isn't gradable. */
export async function gradeSlip(
    record: SlipRecord,
    finals: Map<string, { home: number; away: number }>,
): Promise<GradedSlip | null> {
    if (record.legs.some((l) => !GRADABLE.has(l.market))) {
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
    const payoutMultiple = won ? (record.combinedBookOdds ?? record.combinedFairOdds) : 0;

    const graded: GradedSlip = {
        slipId: record.slipId,
        presetId: record.presetId,
        gradedAt: new Date().toISOString(),
        legResults,
        won,
        combinedBookOdds: record.combinedBookOdds,
        payoutMultiple,
    };

    await store.set(resultKey(record.slipId), graded, 120 * 24 * 60 * 60);
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
    const ids = (await store.get<string[]>(RECENT_KEY)) ?? [];
    const out: Array<GradedSlip & { record: SlipRecord | null }> = [];
    for (const id of ids.slice(0, limit)) {
        const res = await store.get<GradedSlip>(resultKey(id));
        if (!res) continue;
        const record = await store.get<SlipRecord>(slipKey(id));
        out.push({ ...res, legResults: await hydrateLegs(res.legResults, record), record });
    }
    return out;
}

/**
 * Fill in any leg still missing team names or a final score. New slips store both
 * at grade time; older ones fall back to their SlipRecord and, for the score, to
 * the match's own graded prediction result (`result:{matchId}`).
 */
async function hydrateLegs(
    legs: SlipLegResult[],
    record: SlipRecord | null,
): Promise<SlipLegResult[]> {
    return Promise.all(
        legs.map(async (leg, i) => {
            if (leg.home && leg.score) return leg;
            const recLeg = record?.legs[i];
            const gr =
                leg.score == null
                    ? await store.get<{ finalScore?: { home: number; away: number } }>(
                          `result:${leg.matchId}`,
                      )
                    : null;
            return {
                ...leg,
                home: leg.home ?? recLeg?.home,
                away: leg.away ?? recLeg?.away,
                market: leg.market ?? recLeg?.market,
                score: leg.score ?? gr?.finalScore,
            };
        }),
    );
}
