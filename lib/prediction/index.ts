// lib/prediction/index.ts
// The prediction engine entry point. Pure and deterministic — no Math.random,
// no I/O. Given an EnrichedMatch it returns one self-consistent MatchPrediction
// (every market is read off the same Dixon-Coles score matrix).

import type {
    EnrichedMatch,
    MarketLine,
    MarketProbabilities,
    MatchPrediction,
    OutcomeProbabilities,
} from '@/types';
import { leagueByCode, LEAGUES } from '@/lib/leagues';
import { clamp, round1, round3 } from '@/lib/num';
import {
    bttsProbability,
    buildScoreMatrix,
    modalScore,
    outcomeFromMatrix,
    overProbability,
    topScorelines,
} from './poisson';
import { computeLeagueAverages, baseExpectedGoals, formPoints, type LeagueAverages } from './strength';
import { eloOutcome } from './elo';
import { blendOutcomes } from './ensemble';
import { cornersMarket, type CornerRates } from './corners';
import { calibrateOutcome, confidenceScore, type CalibrationMap } from './calibrate';
import { DEFAULT_PARAMS, type ModelParams } from './params';

// 2.5.0 — constants fitted by backtest (lib/prediction/params.ts): much stronger
// shrinkage, rho −0.15, an Elo-heavier 1X2 blend.
// 2.4.0 — recalibration curves learned from logged raw probabilities (1X2
// one-vs-rest) instead of the published, already-calibrated ones.
// 2.3.0 — corners: venue-split team-rate history, negative-binomial total, and
// their own recalibration curve. 2.2.0 — corners lines blended with each side's
// real corners history; outcome probabilities recalibrated against the grading log.
export const MODEL_VERSION = '2.5.0';

export interface PredictOptions {
    /** Precomputed league averages (from the HOME/AWAY standings tables). */
    leagueAverages?: LeagueAverages;
    calibration?: CalibrationMap;
    /** Each side's rolling corners-per-game history, when we have it. */
    cornerRates?: CornerRates;
    /** Overrides for the tunable constants — the backtest only; production uses the defaults. */
    params?: Partial<ModelParams>;
}

function goalsLine(prob: number, over: number, under: number): MarketLine {
    const lean = prob >= over ? 'over' : prob <= under ? 'under' : null;
    return { probability: round3(prob), lean };
}

function bttsLine(prob: number): MarketLine {
    const lean = prob >= 0.6 ? 'yes' : prob <= 0.4 ? 'no' : null;
    return { probability: round3(prob), lean };
}

export function predictMatch(match: EnrichedMatch, opts: PredictOptions = {}): MatchPrediction {
    const league = leagueByCode(match.league) ?? LEAGUES.PL;
    const params: ModelParams = { ...DEFAULT_PARAMS, ...opts.params };

    const avg =
        opts.leagueAverages ??
        computeLeagueAverages(
            [match.home.home, match.away.home],
            [match.home.away, match.away.away],
            league,
        );

    // --- expected goals -------------------------------------------------
    const base = baseExpectedGoals(match.home, match.away, league, avg, params);
    let { home: lambdaHome, away: lambdaAway } = base;

    // Head-to-head nudge on the total (a small weight on a clamped ratio).
    if (match.h2h && match.h2h.matches >= 4) {
        const h2hTotal = match.h2h.avgGoals;
        const modelTotal = lambdaHome + lambdaAway;
        if (modelTotal > 0 && h2hTotal > 0) {
            const ratio = clamp(h2hTotal / modelTotal, 0.86, 1.14);
            const w = params.h2hWeight;
            lambdaHome *= 1 + w * (ratio - 1);
            lambdaAway *= 1 + w * (ratio - 1);
        }
    }

    // --- score matrix + markets --------------------------------------
    const { matrix } = buildScoreMatrix(lambdaHome, lambdaAway, params.rho);
    const poissonOutcome = outcomeFromMatrix(matrix);

    // --- Elo 1X2 ----------------------------------------------------
    const elo = eloOutcome(match.home.elo, match.away.elo, params.eloHomeAdvantage);

    // --- ensemble + calibration -----------------------------------
    const blended = blendOutcomes(poissonOutcome, elo, match.providerOutcome ?? null, params);
    const outcome: OutcomeProbabilities = calibrateOutcome(blended, opts.calibration);

    // --- goals / btts / corners markets --------------------------
    const c = cornersMarket(lambdaHome, lambdaAway, league, opts.cornerRates, opts.calibration);
    const markets: MarketProbabilities = {
        over15: goalsLine(overProbability(matrix, 1.5), 0.7, 0.3),
        over25: goalsLine(overProbability(matrix, 2.5), 0.58, 0.42),
        over35: goalsLine(overProbability(matrix, 3.5), 0.5, 0.35),
        btts: bttsLine(bttsProbability(matrix)),
        corners: {
            over85: c.over85,
            over95: c.over95,
            over105: c.over105,
            over115: c.over115,
            expected: c.expected,
            source: c.source,
        },
    };

    // --- confidence ----------------------------------------------
    const minGames = Math.min(
        match.home.overall.played,
        match.away.overall.played,
    );
    const confidence = confidenceScore({
        outcome,
        dataQuality: match.dataQuality,
        minGamesPlayed: minGames,
        h2h: match.h2h,
        hasProvider: !!match.providerOutcome,
    });

    // --- presentation -------------------------------------------
    const modal = modalScore(matrix);
    const scorelines = topScorelines(matrix, 4).map((s) => ({
        home: s.home,
        away: s.away,
        probability: round3(s.probability),
    }));

    return {
        matchId: match.id,
        outcome: {
            home: round3(outcome.home),
            draw: round3(outcome.draw),
            away: round3(outcome.away),
        },
        expectedGoals: {
            home: round1(lambdaHome),
            away: round1(lambdaAway),
            total: round1(lambdaHome + lambdaAway),
        },
        predictedScore: modal,
        topScorelines: scorelines,
        markets,
        confidence,
        dataQuality: match.dataQuality,
        drivers: buildDrivers(match, { lambdaHome, lambdaAway, outcome, elo }),
        modelVersion: MODEL_VERSION,
        raw: {
            outcome: {
                home: round3(blended.home),
                draw: round3(blended.draw),
                away: round3(blended.away),
            },
            corners95: c.raw95,
            corners105: c.raw105,
        },
    };
}

interface DriverContext {
    lambdaHome: number;
    lambdaAway: number;
    outcome: OutcomeProbabilities;
    elo: OutcomeProbabilities;
}

function buildDrivers(match: EnrichedMatch, ctx: DriverContext): string[] {
    const out: string[] = [];
    const h = match.home.team.shortName;
    const a = match.away.team.shortName;

    const eloGap = match.home.elo - match.away.elo;
    if (Math.abs(eloGap) >= 60) {
        const strong = eloGap > 0 ? h : a;
        out.push(`${strong} rate materially higher (${Math.round(Math.abs(eloGap))} Elo points).`);
    } else {
        out.push('Teams are closely rated — a tight contest on paper.');
    }

    const hf = formPoints(match.home.form);
    const af = formPoints(match.away.form);
    if (Math.abs(hf - af) >= 5) {
        const hot = hf > af ? h : a;
        out.push(`${hot} carry clearly better recent form (${Math.max(hf, af)}/15 pts, last 5).`);
    }

    const total = ctx.lambdaHome + ctx.lambdaAway;
    if (total >= 3.1) out.push(`High projected goal total (${total.toFixed(1)}) — leans to the over.`);
    else if (total <= 2.2) out.push(`Low projected goal total (${total.toFixed(1)}) — leans to the under.`);

    if (match.home.away && match.home.home.played >= 3) {
        const homeHomeGf = match.home.home.goalsFor / Math.max(1, match.home.home.played);
        if (homeHomeGf >= 2) out.push(`${h} are potent at home (${homeHomeGf.toFixed(1)} gpg there).`);
    }
    const awayAwayGa = match.away.away.goalsAgainst / Math.max(1, match.away.away.played);
    if (match.away.away.played >= 3 && awayAwayGa >= 1.8) {
        out.push(`${a} leak goals on the road (${awayAwayGa.toFixed(1)} conceded/away game).`);
    }

    if (match.h2h && match.h2h.matches >= 4) {
        out.push(
            `Last ${match.h2h.matches} meetings: ${match.h2h.homeWins}-${match.h2h.draws}-${match.h2h.awayWins}, ` +
                `${match.h2h.avgGoals.toFixed(1)} goals/game.`,
        );
    }

    if (match.dataQuality === 'core') {
        out.push('Core data only — no live xG/possession feed for this fixture.');
    }

    return out.slice(0, 5);
}
