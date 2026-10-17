// lib/backtest/fit.ts
// Score forecasts over replayed fixtures, and search the model's tunable
// constants (lib/prediction/params.ts) for the set that scores best. Pure.

import type { OutcomeProbabilities } from '@/types';
import type { ModelParams } from '@/lib/prediction/params';
import {
    binaryBrier,
    binaryLogLoss,
    outcomeBrier,
    outcomeLogLoss,
    outcomeOf,
} from '@/lib/scoring';
import { predictSnapshot, snapshotElo, type SeasonReplay, type Snapshot } from './replay';

export interface Fixture {
    replay: SeasonReplay;
    snapshot: Snapshot;
}

export const MARKETS = ['outcome', 'over15', 'over25', 'over35', 'btts'] as const;
export type Market = (typeof MARKETS)[number];

export interface Forecast {
    outcome: OutcomeProbabilities;
    over15: number;
    over25: number;
    over35: number;
    btts: number;
}

export interface Scores {
    n: number;
    /** Share of fixtures where the most likely 1X2 outcome happened. */
    hitRate: number;
    /** Mean log-loss per market. */
    logLoss: Record<Market, number>;
    /** Mean Brier score per market. */
    brier: Record<Market, number>;
}

/** What the search minimises: the three headline markets' mean log-loss, summed. */
export const objective = (s: Scores): number => s.logLoss.outcome + s.logLoss.over25 + s.logLoss.btts;

const zero = (): Record<Market, number> => ({ outcome: 0, over15: 0, over25: 0, over35: 0, btts: 0 });

export function score(fixtures: Fixture[], forecast: (f: Fixture) => Forecast): Scores {
    const logLoss = zero();
    const brier = zero();
    let hits = 0;
    for (const f of fixtures) {
        const p = forecast(f);
        // A NaN would make every comparison in the search false and silently
        // freeze it — fail loudly instead.
        const probs = [p.outcome.home, p.outcome.draw, p.outcome.away, p.over15, p.over25, p.over35, p.btts];
        if (!probs.every(Number.isFinite)) {
            throw new Error(`non-finite forecast for ${f.snapshot.league} match ${f.snapshot.match.id}`);
        }
        const { homeGoals: h, awayGoals: a } = f.snapshot.match;
        const actual = outcomeOf(h, a);
        const goals = h + a;
        const binary: Array<[Exclude<Market, 'outcome'>, number, boolean]> = [
            ['over15', p.over15, goals > 1.5],
            ['over25', p.over25, goals > 2.5],
            ['over35', p.over35, goals > 3.5],
            ['btts', p.btts, h > 0 && a > 0],
        ];
        logLoss.outcome += outcomeLogLoss(p.outcome, actual);
        brier.outcome += outcomeBrier(p.outcome, actual);
        for (const [m, prob, happened] of binary) {
            logLoss[m] += binaryLogLoss(prob, happened);
            brier[m] += binaryBrier(prob, happened);
        }
        const pick = (['home', 'draw', 'away'] as const).reduce((x, y) => (p.outcome[x] >= p.outcome[y] ? x : y));
        if (pick === actual) hits++;
    }
    const n = fixtures.length || 1;
    for (const m of MARKETS) {
        logLoss[m] /= n;
        brier[m] /= n;
    }
    return { n: fixtures.length, hitRate: hits / n, logLoss, brier };
}

// --- forecasters -----------------------------------------------------------

type EloCache = (f: Fixture, params: ModelParams) => { home: number; away: number };

/**
 * Elo is the slow part of a replay (a season prefix per fixture) and depends on
 * only two parameters, so it's memoised per (K, home advantage).
 */
export function createEloCache(): EloCache {
    const byParams = new Map<string, WeakMap<Snapshot, { home: number; away: number }>>();
    return (f, params) => {
        const key = `${params.eloK}|${params.eloHomeAdvantage}`;
        let cache = byParams.get(key);
        if (!cache) byParams.set(key, (cache = new WeakMap()));
        let elo = cache.get(f.snapshot);
        if (!elo) cache.set(f.snapshot, (elo = snapshotElo(f.replay, f.snapshot, params)));
        return elo;
    };
}

/** The live model under `params` (uncalibrated — the live curve is learned separately). */
export function modelForecaster(
    params: ModelParams,
    elo: EloCache = createEloCache(),
): (f: Fixture) => Forecast {
    return (f) => {
        const p = predictSnapshot(f.snapshot, elo(f, params), params);
        return {
            outcome: p.outcome,
            over15: p.markets.over15.probability,
            over25: p.markets.over25.probability,
            over35: p.markets.over35.probability,
            btts: p.markets.btts.probability,
        };
    };
}

/** The no-skill benchmark: every fixture gets the training set's base rates. */
export function baseRateForecaster(train: Fixture[]): (f: Fixture) => Forecast {
    const n = train.length || 1;
    const count = (pred: (h: number, a: number) => boolean) =>
        train.filter(({ snapshot: { match: m } }) => pred(m.homeGoals, m.awayGoals)).length / n;
    const rates: Forecast = {
        outcome: {
            home: count((h, a) => h > a),
            draw: count((h, a) => h === a),
            away: count((h, a) => h < a),
        },
        over15: count((h, a) => h + a > 1.5),
        over25: count((h, a) => h + a > 2.5),
        over35: count((h, a) => h + a > 3.5),
        btts: count((h, a) => h > 0 && a > 0),
    };
    return () => rates;
}

// --- search ----------------------------------------------------------------

export type SearchSpace = Partial<Record<keyof ModelParams, number[]>>;

/**
 * Grid per parameter. providerWeight and h2hWeight are absent on purpose: the
 * replay has no provider odds or head-to-head history to fit them against.
 * rho stops at −0.2: with expected goals capped at 5, anything lower drives the
 * Dixon-Coles 0-1 / 1-0 adjustment (1 + λρ) negative.
 */
export const SEARCH_SPACE: SearchSpace = {
    rho: [-0.2, -0.15, -0.12, -0.1, -0.08, -0.06, -0.04, -0.02, 0, 0.02],
    poissonWeight: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.58, 0.6, 0.7, 0.8, 0.9, 1],
    shrinkGames: [0, 2, 3, 5, 8, 12, 20, 30, 40, 60],
    formSlope: [0, 0.02, 0.04, 0.06, 0.08, 0.12, 0.16],
    formCap: [0, 0.04, 0.08, 0.12, 0.16],
    eloK: [5, 10, 15, 20, 30, 40],
    eloHomeAdvantage: [0, 30, 50, 65, 80, 100, 120],
};

export interface FitResult {
    params: ModelParams;
    objective: number;
    /** Objective evaluations performed. */
    evaluations: number;
}

/**
 * Coordinate descent: sweep each parameter's grid holding the rest fixed, keep
 * any improvement, and repeat until a full round changes nothing. Greedy, but
 * the objective is smooth enough in these parameters for it to settle quickly.
 */
export function fitParams(
    train: Fixture[],
    start: ModelParams,
    space: SearchSpace = SEARCH_SPACE,
    maxRounds = 4,
    onProgress?: (param: keyof ModelParams, value: number, objective: number) => void,
): FitResult {
    const elo = createEloCache();
    const evaluate = (p: ModelParams) => objective(score(train, modelForecaster(p, elo)));

    let best = { ...start };
    let bestObjective = evaluate(best);
    let evaluations = 1;

    for (let round = 0; round < maxRounds; round++) {
        let improved = false;
        for (const [key, values] of Object.entries(space) as Array<[keyof ModelParams, number[]]>) {
            for (const v of values) {
                if (v === best[key]) continue;
                const candidate = { ...best, [key]: v };
                const o = evaluate(candidate);
                evaluations++;
                if (o < bestObjective - 1e-9) {
                    best = candidate;
                    bestObjective = o;
                    improved = true;
                }
            }
            onProgress?.(key, best[key], bestObjective);
        }
        if (!improved) break;
    }
    return { params: best, objective: bestObjective, evaluations };
}
