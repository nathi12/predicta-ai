// lib/scoring.ts
// Proper scoring rules for probability forecasts, shared by live grading
// (lib/tracking.ts) and the backtest (lib/backtest). Pure.
//
// Log-loss punishes confident misses hard and is what the backtest optimises;
// Brier is bounded and easier to read. Lower is better for both.

import type { OutcomeProbabilities } from '@/types';

export type Outcome = 'home' | 'draw' | 'away';

/** Probabilities are clipped here before a log — stored figures are rounded to 3dp, so 0 happens. */
const P_MIN = 0.001;
const clip = (p: number) => Math.min(1 - P_MIN, Math.max(P_MIN, p));

export const outcomeOf = (home: number, away: number): Outcome =>
    home > away ? 'home' : home === away ? 'draw' : 'away';

/** −ln P(what happened). A uniform ⅓ forecast scores ln 3 ≈ 1.099. */
export function outcomeLogLoss(p: OutcomeProbabilities, actual: Outcome): number {
    return -Math.log(clip(p[actual]));
}

/** Sum of squared errors over home / draw / away. A uniform ⅓ forecast scores ⅔. */
export function outcomeBrier(p: OutcomeProbabilities, actual: Outcome): number {
    return (
        (p.home - (actual === 'home' ? 1 : 0)) ** 2 +
        (p.draw - (actual === 'draw' ? 1 : 0)) ** 2 +
        (p.away - (actual === 'away' ? 1 : 0)) ** 2
    );
}

/** −ln of the probability given to what happened, for a yes/no market. A coin flip scores ln 2 ≈ 0.693. */
export function binaryLogLoss(p: number, happened: boolean): number {
    return -Math.log(clip(happened ? p : 1 - p));
}

/** (p − outcome)². A coin flip scores 0.25. */
export function binaryBrier(p: number, happened: boolean): number {
    return (p - (happened ? 1 : 0)) ** 2;
}
