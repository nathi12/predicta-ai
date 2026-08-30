// lib/prediction/strength.ts
// Turns league records into venue-aware attack/defence multipliers and, from
// them, the base expected goals for a fixture. Early-season rates are shrunk
// toward the league average so a 2-game ssample doesn't dominate.

import type { LeagueConfig, RecordSplit, TeamStrength } from '@/types';

export interface LeagueAverages {
    /** Mean goals scored by the home side across the division. */
    homeFor: number;
    /** Mean goals conceded by the home side (= mean scored by away sides). */
    homeAgainst: number;
    awayFor: number;
    awayAgainst: number;
}

const SHRINK_K = 5;

const perGame = (r: RecordSplit, field: 'goalsFor' | 'goalsAgainst'): number =>
    r.played > 0 ? r[field] / r.played : NaN;

/** Blend an observed rate with a prior; weight of the prior = SHRINK_K games. */
function shrink(rate: number, prior: number, games: number): number {
    if (!Number.isFinite(rate)) return prior;
    return (rate * games + prior * SHRINK_K) / (games + SHRINK_K);
}

export function computeLeagueAverages(
    homeTable: RecordSplit[],
    awayTable: RecordSplit[],
    fallback: LeagueConfig,
): LeagueAverages {
    const sum = (rows: RecordSplit[], f: 'goalsFor' | 'goalsAgainst' | 'played') =>
        rows.reduce((s, r) => s + r[f], 0);

    const hp = sum(homeTable, 'played');
    const ap = sum(awayTable, 'played');

    if (hp < 20 || ap < 20) {
        // Too little data this season — lean on the configured league prior.
        const total = fallback.baseGoals;
        const homeFor = total * fallback.homeGoalShare;
        const awayFor = total * (1 - fallback.homeGoalShare);
        return { homeFor, homeAgainst: awayFor, awayFor, awayAgainst: homeFor };
    }

    return {
        homeFor: sum(homeTable, 'goalsFor') / hp,
        homeAgainst: sum(homeTable, 'goalsAgainst') / hp,
        awayFor: sum(awayTable, 'goalsFor') / ap,
        awayAgainst: sum(awayTable, 'goalsAgainst') / ap,
    };
}

export interface TeamRatings {
    attack: number; // >1 = scores more than an average side at this venue
    defense: number; // <1 = concedes less than average (good)
}

function ratings(
    split: RecordSplit,
    forAvg: number,
    againstAvg: number,
    enrichedFor?: number,
    enrichedAgainst?: number,
): TeamRatings {
    const gf = shrink(perGame(split, 'goalsFor'), forAvg, split.played);
    const ga = shrink(perGame(split, 'goalsAgainst'), againstAvg, split.played);

    let attack = gf / forAvg;
    let defense = ga / againstAvg;

    // Blend in the last-5 enrichment when we have it (30% weight).
    if (Number.isFinite(enrichedFor as number)) {
        attack = 0.7 * attack + 0.3 * ((enrichedFor as number) / forAvg);
    }
    if (Number.isFinite(enrichedAgainst as number)) {
        defense = 0.7 * defense + 0.3 * ((enrichedAgainst as number) / againstAvg);
    }

    return {
        attack: clamp(attack, 0.35, 2.6),
        defense: clamp(defense, 0.35, 2.6),
    };
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}

/** Points from the last five results (W=3, D=1). */
export function formPoints(form: Array<'W' | 'D' | 'L'>): number {
    return form.slice(0, 5).reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
}

/**
 * Recency multiplier: teams markedly over/under their season baseline over the
 * last five games get a gentle nudge (max ±8%).
 */
function formMultiplier(form: Array<'W' | 'D' | 'L'>, enrichedFormPoints?: number): number {
    const pts = Number.isFinite(enrichedFormPoints as number)
        ? (enrichedFormPoints as number)
        : formPoints(form);
    const games = Math.min(5, form.length) || 5;
    const ppg = pts / games;
    // League-average ppg is ~1.35; scale the gap into ±0.08.
    return clamp(1 + (ppg - 1.35) * 0.06, 0.92, 1.08);
}

export interface BaseLambdas {
    home: number;
    away: number;
    homeAttack: TeamRatings;
    awayAttack: TeamRatings;
}

export function baseExpectedGoals(
    home: TeamStrength,
    away: TeamStrength,
    league: LeagueConfig,
    avg: LeagueAverages,
): BaseLambdas {
    const homeR = ratings(
        home.home,
        avg.homeFor,
        avg.homeAgainst,
        home.enriched?.recentGoalsFor,
        home.enriched?.recentGoalsAgainst,
    );
    const awayR = ratings(
        away.away,
        avg.awayFor,
        avg.awayAgainst,
        away.enriched?.recentGoalsFor,
        away.enriched?.recentGoalsAgainst,
    );

    const homeFormMult = formMultiplier(home.form, home.enriched?.formPoints);
    const awayFormMult = formMultiplier(away.form, away.enriched?.formPoints);

    const lambdaHome = homeR.attack * awayR.defense * avg.homeFor * homeFormMult;
    const lambdaAway = awayR.attack * homeR.defense * avg.awayFor * awayFormMult;

    return {
        home: clamp(lambdaHome, 0.15, 5),
        away: clamp(lambdaAway, 0.15, 5),
        homeAttack: homeR,
        awayAttack: awayR,
    };
}
