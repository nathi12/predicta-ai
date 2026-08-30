// lib/prediction/poisson.ts
// Bivariate-Poisson goal model with the Dixon-Coles low-score correction.
// Everything downstream (1X2, O/U, BTTS, correct score) is read off one
// score matrix so the numbers can never contradict each other.

const MAX_GOALS = 10;

export function poissonPmf(lambda: number, k: number): number {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    // exp(k*ln(lambda) - lambda - ln(k!))
    let logFact = 0;
    for (let i = 2; i <= k; i++) logFact += Math.log(i);
    return Math.exp(k * Math.log(lambda) - lambda - logFact);
}

/**
 * Dixon-Coles tau correction for the four low-scoring cells. `rho` in roughly
 * [-0.15, 0]; negative rho lifts 0-0 / 1-1 and trims 1-0 / 0-1, matching the
 * empirical excess of low draws.
 */
function tau(i: number, j: number, lh: number, la: number, rho: number): number {
    if (i === 0 && j === 0) return 1 - lh * la * rho;
    if (i === 0 && j === 1) return 1 + lh * rho;
    if (i === 1 && j === 0) return 1 + la * rho;
    if (i === 1 && j === 1) return 1 - rho;
    return 1;
}

export interface ScoreMatrix {
    /** matrix[i][j] = P(home i, away j). Rows/cols 0..MAX_GOALS, sums to ~1. */
    matrix: number[][];
    lambdaHome: number;
    lambdaAway: number;
}

export function buildScoreMatrix(lambdaHome: number, lambdaAway: number, rho = -0.06): ScoreMatrix {
    const home: number[] = [];
    const away: number[] = [];
    for (let k = 0; k <= MAX_GOALS; k++) {
        home[k] = poissonPmf(lambdaHome, k);
        away[k] = poissonPmf(lambdaAway, k);
    }

    const matrix: number[][] = [];
    let total = 0;
    for (let i = 0; i <= MAX_GOALS; i++) {
        matrix[i] = [];
        for (let j = 0; j <= MAX_GOALS; j++) {
            const p = home[i] * away[j] * tau(i, j, lambdaHome, lambdaAway, rho);
            matrix[i][j] = p;
            total += p;
        }
    }
    // Renormalise (tau + truncation perturb the mass slightly).
    for (let i = 0; i <= MAX_GOALS; i++) {
        for (let j = 0; j <= MAX_GOALS; j++) matrix[i][j] /= total;
    }

    return { matrix, lambdaHome, lambdaAway };
}

export function outcomeFromMatrix(m: number[][]): { home: number; draw: number; away: number } {
    let home = 0;
    let draw = 0;
    let away = 0;
    for (let i = 0; i < m.length; i++) {
        for (let j = 0; j < m[i].length; j++) {
            if (i > j) home += m[i][j];
            else if (i === j) draw += m[i][j];
            else away += m[i][j];
        }
    }
    return { home, draw, away };
}

/** P(total goals > line), e.g. line = 2.5 for Over 2.5. */
export function overProbability(m: number[][], line: number): number {
    let p = 0;
    for (let i = 0; i < m.length; i++) {
        for (let j = 0; j < m[i].length; j++) {
            if (i + j > line) p += m[i][j];
        }
    }
    return p;
}

export function bttsProbability(m: number[][]): number {
    let p = 0;
    for (let i = 1; i < m.length; i++) {
        for (let j = 1; j < m[i].length; j++) p += m[i][j];
    }
    return p;
}

export interface ScorelineProb {
    home: number;
    away: number;
    probability: number;
}

export function topScorelines(m: number[][], count = 4): ScorelineProb[] {
    const all: ScorelineProb[] = [];
    for (let i = 0; i < m.length; i++) {
        for (let j = 0; j < m[i].length; j++) {
            all.push({ home: i, away: j, probability: m[i][j] });
        }
    }
    return all.sort((a, b) => b.probability - a.probability).slice(0, count);
}

/** Most likely scoreline consistent with the matrix (not a rounded mean). */
export function modalScore(m: number[][]): { home: number; away: number } {
    const [best] = topScorelines(m, 1);
    return { home: best.home, away: best.away };
}
