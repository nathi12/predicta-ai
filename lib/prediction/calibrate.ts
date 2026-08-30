// lib/prediction/calibrate.ts
// Probability calibration + an honest confidence score.
//
// The calibration map is learned from the grading log (see lib/tracking.ts).
// Until enough games are graded it is the identity, so predictions are never
// blocked on having a track record.

import type { DataQuality, HeadToHead, OutcomeProbabilities } from '@/types';

export interface CalibrationMap {
    /** Piecewise-linear points mapping raw favourite prob -> observed rate. */
    outcome?: Array<{ x: number; y: number }>;
}

function applyPiecewise(p: number, points?: Array<{ x: number; y: number }>): number {
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
