// lib/prediction/calibrate.ts
// Probability calibration + an honest confidence score.
//
// The calibration map is learned from the grading log (see lib/tracking.ts).
// Until enough games are graded it is the identity, so predictions are never
// blocked on having a track record.

import type { DataQuality, HeadToHead, OutcomeProbabilities, RollingStats } from '@/types';

export type CalibrationCurve = Array<{ x: number; y: number }>;

export interface CalibrationMap {
    /** Piecewise-linear points mapping raw favourite prob -> observed rate. */
    outcome?: CalibrationCurve;
    /** Same idea for the corners over-9.5 / over-10.5 probabilities, learned
     *  from their own grading bins. Absent until corners have enough history. */
    corners95?: CalibrationCurve;
    corners105?: CalibrationCurve;
}

// --- learning the map from the grading log --------------------------------

/** Graded predictions needed before the learned map replaces the identity. */
export const CALIBRATION_MIN_TOTAL = 150;
/** Minimum sample in a decile bin before its point is trusted at all. */
export const CALIBRATION_MIN_BIN = 20;
/** Pulls each bin's correction back toward the identity until it's well-sampled. */
export const CALIBRATION_BIN_PRIOR = 40;
/** Combined graded lines (over-9.5 + over-10.5) before corners recalibration goes live. */
export const CORNERS_CALIBRATION_MIN_TOTAL = 150;

type CalBin = { predicted: number; actual: number; n: number };

/**
 * Turn one market's calibration bins (predicted vs observed by decile, see
 * foldIntoRolling) into a monotonic piecewise-linear recalibration curve,
 * anchored at (0,0)/(1,1) and holding the identity below the range the data
 * actually informs. Returns undefined until two bins clear CALIBRATION_MIN_BIN.
 *
 * Shared by the 1X2 and corners maps so both learn the curve the same way.
 */
function curveFromBins(bins: CalBin[]): CalibrationCurve | undefined {
    const learned = bins
        .filter((b) => b.n >= CALIBRATION_MIN_BIN)
        .map((b) => {
            const x = b.predicted / b.n; // mean forecast that landed in this bin
            const rawY = b.actual / b.n; // observed hit rate
            const w = b.n / (b.n + CALIBRATION_BIN_PRIOR);
            return { x, y: x + (rawY - x) * w };
        })
        .sort((a, b) => a.x - b.x);

    if (learned.length < 2) return undefined;

    // Below the range the bins inform we have no signal, so hold the identity.
    // For 1X2 this keeps calibrateOutcome's renormalisation sound (a shed
    // favourite probability flows to the field instead of being scaled away).
    const loX = Math.max(0, Math.min(0.3, learned[0].x - 0.02));

    const points = [{ x: 0, y: 0 }];
    if (loX > 0) points.push({ x: loX, y: loX });

    // Force a non-decreasing curve — a calibration map is monotonic.
    let prevY = loX;
    for (const p of learned) {
        const y = Math.min(1, Math.max(prevY, p.y));
        points.push({ x: p.x, y });
        prevY = y;
    }
    points.push({ x: 1, y: 1 });

    return points;
}

/**
 * Build the 1X2 recalibration curve from the grading log's favourite-probability
 * bins. Returns undefined — i.e. the identity, a no-op in calibrateOutcome —
 * until there's enough graded history to trust, so predictions are never blocked
 * on having a track record.
 *
 * Note the loop is mildly self-referential once live: new predictions are stored
 * already-calibrated, so the bins then measure the *residual* error and the map
 * converges. The per-bin shrinkage keeps that stable.
 */
export function buildCalibrationMap(bins: RollingStats['calibration']): CalibrationMap | undefined {
    const total = bins.reduce((s, b) => s + b.n, 0);
    if (total < CALIBRATION_MIN_TOTAL) return undefined;
    const outcome = curveFromBins(bins);
    return outcome ? { outcome } : undefined;
}

/**
 * Build the corners recalibration curves (one per line) from their grading bins.
 * Same construction as the 1X2 map; kept separate so a thin corners sample never
 * gates the 1X2 curve and vice versa. Returns undefined until there's enough
 * combined graded history, so corners lines are untouched until then.
 */
export function buildCornerCalibrationMap(
    bins95: RollingStats['calibration'],
    bins105: RollingStats['calibration'],
): Pick<CalibrationMap, 'corners95' | 'corners105'> | undefined {
    const total =
        bins95.reduce((s, b) => s + b.n, 0) + bins105.reduce((s, b) => s + b.n, 0);
    if (total < CORNERS_CALIBRATION_MIN_TOTAL) return undefined;
    const corners95 = curveFromBins(bins95);
    const corners105 = curveFromBins(bins105);
    if (!corners95 && !corners105) return undefined;
    return {
        ...(corners95 ? { corners95 } : {}),
        ...(corners105 ? { corners105 } : {}),
    };
}

/** Map a probability through a piecewise-linear curve. No curve => identity. */
export function applyPiecewise(p: number, points?: CalibrationCurve): number {
    if (!points || points.length < 2) return p;
    const pts = [...points].sort((a, b) => a.x - b.x);
    if (p <= pts[0].x) return pts[0].y;
    if (p >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    for (let i = 1; i < pts.length; i++) {
        if (p <= pts[i].x) {
            const t = (p - pts[i - 1].x) / (pts[i].x - pts[i - 1].x || 1);
            return pts[i - 1].y + t * (pts[i].y - pts[i - 1].y);
        }
    }
    return p;
}

/**
 * Nudge each outcome probability toward its calibrated value, then renormalise.
 * With no map this is a no-op.
 */
export function calibrateOutcome(o: OutcomeProbabilities, map?: CalibrationMap): OutcomeProbabilities {
    if (!map?.outcome) return o;
    const home = applyPiecewise(o.home, map.outcome);
    const draw = applyPiecewise(o.draw, map.outcome);
    const away = applyPiecewise(o.away, map.outcome);
    const s = home + draw + away || 1;
    return { home: home / s, draw: draw / s, away: away / s };
}

function entropy3(o: OutcomeProbabilities): number {
    const ps = [o.home, o.draw, o.away].filter((p) => p > 0);
    const h = -ps.reduce((s, p) => s + p * Math.log(p), 0);
    return h / Math.log(3); // 0 (certain) .. 1 (uniform)
}

export interface ConfidenceInputs {
    outcome: OutcomeProbabilities;
    dataQuality: DataQuality;
    minGamesPlayed: number;
    h2h?: HeadToHead | null;
    hasProvider: boolean;
}

/** 20-92. Sharper distribution + better data => higher. */
export function confidenceScore(inp: ConfidenceInputs): number {
    const sharpness = 1 - entropy3(inp.outcome); // 0..1
    let score = 38 + sharpness * 46;

    if (inp.dataQuality === 'enriched') score += 5;
    if (inp.hasProvider) score += 3;
    if (inp.h2h && inp.h2h.matches >= 4) score += 2;

    if (inp.minGamesPlayed >= 12) score += 5;
    else if (inp.minGamesPlayed >= 8) score += 2;
    else if (inp.minGamesPlayed >= 4) score -= 2;
    else score -= 7;

    return Math.max(20, Math.min(92, Math.round(score)));
}
