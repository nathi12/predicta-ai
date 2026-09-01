// lib/prediction/corners.ts
// Corner markets. Two estimators for the expected total:
//   - proxy: expected corners scale with attacking volume (read from expected
//     goals) around the league base rate. Always available.
//   - team rates: each side's real corners-for / corners-against per game, from
//     API-Football match stats (see lib/cornerRates.ts), split by venue. Blended
//     in once both sides have a few venue-relevant games; the proxy carries the
//     rest.
// The total is modelled as negative-binomial (mild overdispersion vs Poisson).
// Still treated as lower-confidence than the goals markets.

import type { CalibrationCurve } from './calibrate';
import { applyPiecewise } from './calibrate';
import type { CornerRate, LeagueConfig, MarketLine } from '@/types';
import { poissonPmf } from './poisson';

/** Venue-relevant samples needed before a side's history is trusted at all. */
export const CORNER_RATES_MIN_N = 4;
/** Shrinks the team-rate estimate toward the proxy until the sample is deep. */
const CORNER_RATES_PRIOR = 6;

/**
 * Corner totals are mildly overdispersed vs Poisson (public data puts the
 * variance around 1.1–1.2× the mean). A plain Poisson makes the over/under
 * probabilities a touch too sharp right where the 9.5/10.5 lines sit, so the
 * total is modelled negative-binomial with this dispersion φ = variance / mean.
 * A literature-informed prior — revisit once the corners calibration bins carry
 * enough graded history to estimate it directly.
 */
export const CORNERS_DISPERSION = 1.15;

export interface CornerRates {
    /** The home-side team's venue-split record. */
    home: CornerRate;
    /** The away-side team's venue-split record. */
    away: CornerRate;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// --- distribution -------------------------------------------------------

/** log Γ(x), Lanczos approximation (g=7). Accurate to ~1e-13 for x > 0. */
function lgamma(x: number): number {
    const c = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    if (x < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    }
    x -= 1;
    const g = 7;
    const t = x + g + 0.5;
    let a = c[0];
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Negative-binomial PMF by mean and dispersion φ = variance / mean (φ > 1
 * overdispersed; φ ≤ 1 falls back to Poisson). Internally r = mean / (φ − 1).
 */
function negBinomPmf(mean: number, phi: number, k: number): number {
    if (mean <= 0) return k === 0 ? 1 : 0;
    if (phi <= 1) return poissonPmf(mean, k);
    const r = mean / (phi - 1);
    const p = r / (r + mean);
    const logCoef = lgamma(k + r) - lgamma(r) - lgamma(k + 1);
    return Math.exp(logCoef + r * Math.log(p) + k * Math.log(1 - p));
}

/** P(total corners > line) for an integer line+0.5, under the NB total model. */
export function cornersOverProbability(mean: number, line: number): number {
    let cdf = 0;
    for (let k = 0; k <= Math.floor(line); k++) cdf += negBinomPmf(mean, CORNERS_DISPERSION, k);
    return clamp(1 - cdf, 0, 1);
}

/** Recalibrate an over-probability through its learned curve, if we have one. */
function calibrated(prob: number, curve?: CalibrationCurve): number {
    return curve ? clamp(applyPiecewise(prob, curve), 0, 1) : prob;
}

function line(prob: number): MarketLine {
    const lean = prob >= 0.62 ? 'over' : prob <= 0.38 ? 'under' : null;
    return { probability: round(prob), lean };
}

// --- expected total ----------------------------------------------------

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
 * Blend the proxy with a team-rate estimate. The team estimate pairs the home
 * side's at-home corner rate with the away side's away rate (attack meets
 * defence, venue-correct), then shrinks toward the proxy by how much history
 * backs it.
 */
export function blendedExpectedCorners(
    proxy: number,
    rates: CornerRates | undefined,
): { expected: number; source: 'proxy' | 'team-rates' } {
    const homeRate = rates?.home.atHome; // home team, playing at home
    const awayRate = rates?.away.atAway; // away team, playing away
    if (
        !homeRate ||
        !awayRate ||
        homeRate.n < CORNER_RATES_MIN_N ||
        awayRate.n < CORNER_RATES_MIN_N
    ) {
        return { expected: proxy, source: 'proxy' };
    }

    const homeSide = (homeRate.for + awayRate.against) / 2;
    const awaySide = (awayRate.for + homeRate.against) / 2;
    const teamEst = clamp(homeSide + awaySide, 6, 15);

    const nMin = Math.min(homeRate.n, awayRate.n);
    const w = nMin / (nMin + CORNER_RATES_PRIOR);
    const expected = clamp(w * teamEst + (1 - w) * proxy, 6, 15);
    return { expected: round(expected), source: 'team-rates' };
}

// --- market ----------------------------------------------------------

export interface CornersCalibration {
    corners95?: CalibrationCurve;
    corners105?: CalibrationCurve;
}

export function cornersMarket(
    lambdaHome: number,
    lambdaAway: number,
    league: LeagueConfig,
    rates?: CornerRates,
    calibration?: CornersCalibration,
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

    // Only the traded lines (9.5 / 10.5) have grading history to recalibrate
    // against; 8.5 / 11.5 stay on the raw model. Clamp the ladder non-increasing
    // so a recalibration nudge on a middle rung can't invert the display.
    const p85 = cornersOverProbability(expected, 8.5);
    const p95 = Math.min(
        calibrated(cornersOverProbability(expected, 9.5), calibration?.corners95),
        p85,
    );
    const p105 = Math.min(
        calibrated(cornersOverProbability(expected, 10.5), calibration?.corners105),
        p95,
    );
    const p115 = Math.min(cornersOverProbability(expected, 11.5), p105);

    return {
        over85: line(p85),
        over95: line(p95),
        over105: line(p105),
        over115: line(p115),
        expected: Math.round(expected * 10) / 10,
        source,
    };
}
