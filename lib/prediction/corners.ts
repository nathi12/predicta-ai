// lib/prediction/corners.ts
// Corner markets. The free data tier gives us no real corner counts, so this
// is a principled proxy: expected corners scale with attacking volume (which
// we read from expected goals) around the league base rate. Modelled as a
// Poisson total. Treated as lower-confidence than the goals markets.

import type { LeagueConfig, MarketLine } from '@/types';
import { poissonPmf } from './poisson';

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

export function expectedCorners(
    lambdaHome: number,
    lambdaAway: number,
    league: LeagueConfig,
): number {
    const totalGoals = lambdaHome + lambdaAway;
    // Dampened scaling: a 20% busier game than average => ~10% more corners.
    const factor = Math.sqrt(totalGoals / league.baseGoals);
    return Math.max(6, Math.min(15, league.baseCorners * factor));
}

export function cornersMarket(
    lambdaHome: number,
    lambdaAway: number,
    league: LeagueConfig,
): {
    over85: MarketLine;
    over95: MarketLine;
    over105: MarketLine;
    over115: MarketLine;
    expected: number;
} {
    const lambda = expectedCorners(lambdaHome, lambdaAway, league);
    return {
        over85: line(overProb(lambda, 8.5)),
        over95: line(overProb(lambda, 9.5)),
        over105: line(overProb(lambda, 10.5)),
        over115: line(overProb(lambda, 11.5)),
        expected: Math.round(lambda * 10) / 10,
    };
}
