// lib/prediction/corners.ts
// Corner markets. Two estimators for the expected total:
//   - proxy: expected corners scale with attacking volume (read from expected
//     goals) around the league base rate. Always available.
//   - team rates: each side's real corners-for / corners-against per game, from
//     API-Football match stats (see lib/cornerRates.ts). Blended in once both
//     teams have a few graded games; the proxy carries the rest.
// Modelled as a Poisson total. Treated as lower-confidence than the goals markets.

import type { CornerRate, LeagueConfig, MarketLine } from '@/types';
import { poissonPmf } from './poisson';

/** Team-rate samples needed before that side's history is trusted at all. */
export const CORNER_RATES_MIN_N = 4;
/** Shrinks the team-rate estimate toward the proxy until the sample is deep. */
const CORNER_RATES_PRIOR = 6;

export interface CornerRates {
    home: CornerRate;
    away: CornerRate;
}

function overProb(lambda: number, line: number): number {
    // P(X > line) for integer line+0.5
    let cdf = 0;
    for (let k = 0; k <= Math.floor(line); k++) cdf += poissonPmf(lambda, k);
    return 1 - cdf;
}

function line(prob: number): MarketLine {
    const lean = prob >= 0.62 ? 'over' : prob <= 0.38 ? 'under' : null;
    return { probability: round(prob), lean };
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Proxy estimate: league base corners scaled by how busy the game projects. */
export function expectedCorners(
    lambdaHome: number,
    lambdaAway: number,
    league: LeagueConfig,
): number {
    const totalGoals = lambdaHome + lambdaAway;
    // Dampened scaling: a 20% busier game than average => ~10% more corners.
    const factor = Math.sqrt(totalGoals / league.baseGoals);
    return clamp(league.baseCorners * factor, 6, 15);
}

/**
 * Blend the proxy with a team-rate estimate. The team estimate pairs each side's
 * attacking corner rate with the other side's conceded rate (attack meets
 * defence), then shrinks toward the proxy by how much history backs it.
 */
export function blendedExpectedCorners(
    proxy: number,
    rates: CornerRates | undefined,
): { expected: number; source: 'proxy' | 'team-rates' } {
    if (
        !rates ||
        rates.home.n < CORNER_RATES_MIN_N ||
        rates.away.n < CORNER_RATES_MIN_N
    ) {
        return { expected: proxy, source: 'proxy' };
    }

    const homeSide = (rates.home.for + rates.away.against) / 2;
    const awaySide = (rates.away.for + rates.home.against) / 2;
    const teamEst = clamp(homeSide + awaySide, 6, 15);

    const nMin = Math.min(rates.home.n, rates.away.n);
    const w = nMin / (nMin + CORNER_RATES_PRIOR);
    const expected = clamp(w * teamEst + (1 - w) * proxy, 6, 15);
    return { expected: round(expected), source: 'team-rates' };
}

export function cornersMarket(
    lambdaHome: number,
    lambdaAway: number,
    league: LeagueConfig,
    rates?: CornerRates,
): {
    over85: MarketLine;
    over95: MarketLine;
    over105: MarketLine;
    over115: MarketLine;
    expected: number;
    source: 'proxy' | 'team-rates';
} {
    const proxy = expectedCorners(lambdaHome, lambdaAway, league);
    const { expected, source } = blendedExpectedCorners(proxy, rates);
    return {
        over85: line(overProb(expected, 8.5)),
        over95: line(overProb(expected, 9.5)),
        over105: line(overProb(expected, 10.5)),
        over115: line(overProb(expected, 11.5)),
        expected: Math.round(expected * 10) / 10,
        source,
    };
}
