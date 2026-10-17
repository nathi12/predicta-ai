// lib/fixtures/summary.ts
// The slim per-fixture shape the fixtures list ships to the client. Season
// records, form, Elo, scorelines and drivers stay on the server — the match
// page renders those.

import type { DataQuality, LeagueCode, MatchWithPrediction, OutcomeProbabilities } from '@/types';

export interface FixtureTeam {
    name: string;
    tla: string;
    crest?: string;
}

export interface FixtureSummary {
    id: string;
    league: LeagueCode;
    leagueName: string;
    /** ISO kickoff time (UTC). */
    kickoff: string;
    dataQuality: DataQuality;
    home: FixtureTeam;
    away: FixtureTeam;
    outcome: OutcomeProbabilities;
    expectedGoals: { home: number; away: number };
    predictedScore: { home: number; away: number };
    /** 0-100. */
    confidence: number;
    /** Probability (0-1) of the over / yes side; corners are null when not modelled. */
    markets: {
        over15: number;
        over25: number;
        over35: number;
        btts: number;
        corners95: number | null;
        corners105: number | null;
    };
}

export function toFixtureSummary({ match, prediction }: MatchWithPrediction): FixtureSummary {
    const team = (t: MatchWithPrediction['match']['home']['team']): FixtureTeam => ({
        name: t.shortName,
        tla: t.tla,
        ...(t.crest ? { crest: t.crest } : {}),
    });
    const g = prediction.markets;
    return {
        id: match.id,
        league: match.league,
        leagueName: match.leagueName,
        kickoff: match.kickoff,
        dataQuality: match.dataQuality,
        home: team(match.home.team),
        away: team(match.away.team),
        outcome: prediction.outcome,
        expectedGoals: { home: prediction.expectedGoals.home, away: prediction.expectedGoals.away },
        predictedScore: prediction.predictedScore,
        confidence: prediction.confidence,
        markets: {
            over15: g.over15.probability,
            over25: g.over25.probability,
            over35: g.over35.probability,
            btts: g.btts.probability,
            corners95: g.corners?.over95.probability ?? null,
            corners105: g.corners?.over105.probability ?? null,
        },
    };
}
