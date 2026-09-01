// lib/cornerRates.ts
// Rolling per-team corners-for / corners-against history, harvested from the
// API-Football match-stats call the grade cron already makes (live grading) and
// from a paced historical backfill (see the grade cron's drainCornerBackfill).
// Feeds the corners model (lib/prediction/corners.ts) so its lines are driven by
// real corner counts, split by venue, once a side has a few relevant games.

import 'server-only';
import { store } from '@/lib/kv';
import { CORNER_RATES_MIN_N } from '@/lib/prediction/corners';
import type { CornerRate, VenueCornerRate } from '@/types';

// v2: samples are split by venue. A clean cutover from v1 (which had no split) —
// v1 data was thin and the backfill repopulates this faster than passive
// accumulation ever did, so no migration.
const KEY = 'corners:rates:v2';
/** Games kept per team per venue; the mean over this window is the rate. */
const WINDOW = 12;
/** Set of team ids awaiting a historical backfill. */
const BACKFILL_QUEUE = 'corners:backfill:queue';
/** Per-fixture "already folded into the rate store" flag, kept well past its use. */
const FOLD_FLAG_TTL = 60 * 24 * 60 * 60;

type Venue = 'atHome' | 'atAway';
/** One game: [corners won, corners conceded]. */
type Sample = [number, number];
type TeamRecord = { atHome: Sample[]; atAway: Sample[] };
type RatesStore = Record<string, TeamRecord>;

/** Per-team corner rates, keyed by API-Football team id. */
export type CornerRatesByTeam = Record<number, CornerRate>;

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function toVenueRate(samples: Sample[]): VenueCornerRate {
    return {
        for: mean(samples.map((x) => x[0])),
        against: mean(samples.map((x) => x[1])),
        n: samples.length,
    };
}

/** Every team's corner rate. Read once per build; look sides up with pickRates. */
export async function getAllCornerRates(): Promise<CornerRatesByTeam> {
    const all = (await store.get<RatesStore>(KEY)) ?? {};
    const out: CornerRatesByTeam = {};
    for (const [id, rec] of Object.entries(all)) {
        out[Number(id)] = {
            atHome: toVenueRate(rec.atHome ?? []),
            atAway: toVenueRate(rec.atAway ?? []),
        };
    }
    return out;
}

/** The two sides' rates, or undefined when either id is missing or unseen. */
export function pickRates(
    all: CornerRatesByTeam,
    homeId: number | undefined,
    awayId: number | undefined,
): { home: CornerRate; away: CornerRate } | undefined {
    if (!homeId || !awayId) return undefined;
    const home = all[homeId];
    const away = all[awayId];
    if (!home || !away) return undefined;
    return { home, away };
}

function pushSample(all: RatesStore, team: number, venue: Venue, won: number, conceded: number) {
    const rec: TeamRecord = all[team] ?? { atHome: [], atAway: [] };
    rec[venue] = [[won, conceded] as Sample, ...(rec[venue] ?? [])].slice(0, WINDOW);
    all[team] = rec;
}

/**
 * Fold one finished fixture's corner counts into both teams' venue histories,
 * exactly once. Shared by the live grader and the historical backfill so a
 * fixture reached by either path — or by both — is never double-counted.
 */
export async function foldFixtureCorners(
    fixtureId: number,
    byTeamId: Record<number, number>,
    homeId: number | undefined,
    awayId: number | undefined,
): Promise<boolean> {
    if (!homeId || !awayId) return false;
    const homeCorners = byTeamId[homeId];
    const awayCorners = byTeamId[awayId];
    if (homeCorners == null || awayCorners == null) return false;

    // Atomic claim: only the first caller for this fixture gets the fold.
    const seen = await store.incr(`corners:folded:${fixtureId}`, FOLD_FLAG_TTL);
    if (seen !== 1) return false;

    const all = (await store.get<RatesStore>(KEY)) ?? {};
    pushSample(all, homeId, 'atHome', homeCorners, awayCorners);
    pushSample(all, awayId, 'atAway', awayCorners, homeCorners);
    await store.set(KEY, all);
    return true;
}

// --- historical backfill queue ------------------------------------------
//
// matchData.ts adds a team here whenever it resolves an API-Football id for an
// upcoming fixture and that side's venue-relevant sample is still thin. The
// grade cron drains a few per day. This keeps the backfill aimed at the teams
// that are actually about to be predicted rather than the whole league at once.

/** Queue a team for backfill when its rate for the venue it's about to play is thin. */
export async function queueBackfillIfNeeded(
    teamId: number | undefined,
    rate: CornerRate | undefined,
    venue: Venue,
): Promise<void> {
    if (!teamId) return;
    if ((rate?.[venue]?.n ?? 0) >= CORNER_RATES_MIN_N) return;
    await store.sadd(BACKFILL_QUEUE, String(teamId));
}

export async function pendingBackfillTeamIds(): Promise<number[]> {
    const ids = await store.smembers(BACKFILL_QUEUE);
    return ids.map(Number).filter((n) => Number.isFinite(n));
}

export async function dequeueBackfillTeam(teamId: number): Promise<void> {
    await store.srem(BACKFILL_QUEUE, String(teamId));
}
