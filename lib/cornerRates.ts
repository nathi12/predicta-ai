// lib/cornerRates.ts
// Rolling per-team corners-for / corners-against history, harvested from the
// API-Football match-stats call the grade cron already makes. Feeds the corners
// model (see lib/prediction/corners.ts) so its lines are driven by real corner
// counts once a team has a few graded games, not just the goals proxy.

import 'server-only';
import { store } from '@/lib/kv';
import type { CornerRate } from '@/types';

const KEY = 'corners:rates:v1';
/** Games kept per team; the mean over this window is the rate. */
const WINDOW = 12;

/** One game: [corners won, corners conceded]. */
type Sample = [number, number];
type RatesStore = Record<string, Sample[]>;

/** Per-team corner rates, keyed by API-Football team id. */
export type CornerRatesByTeam = Record<number, CornerRate>;

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function toRate(samples: Sample[]): CornerRate {
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
    for (const [id, samples] of Object.entries(all)) out[Number(id)] = toRate(samples);
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

/**
 * Fold one finished match's corner counts into both teams' histories.
 * `byTeamId` must hold exactly the two sides' totals.
 */
export async function recordTeamCorners(byTeamId: Record<number, number>): Promise<void> {
    const ids = Object.keys(byTeamId).map(Number).filter(Number.isFinite);
    if (ids.length !== 2) return;
    const [a, b] = ids;

    const all = (await store.get<RatesStore>(KEY)) ?? {};
    const push = (team: number, won: number, conceded: number) => {
        all[team] = [[won, conceded] as Sample, ...(all[team] ?? [])].slice(0, WINDOW);
    };
    push(a, byTeamId[a], byTeamId[b]);
    push(b, byTeamId[b], byTeamId[a]);

    await store.set(KEY, all);
}
