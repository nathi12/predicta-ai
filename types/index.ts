// types/index.ts

export interface FootballTeam {
    name: string;
    logo?: string;
    league: string;
    form: string;
    goalsScored: number;
    goalsConceded: number;
    wins: number;
    draws: number;
    losses: number;
    averagePossession: number;
    shotsPerGame: number;
    shotsOnTargetPerGame: number;
    passAccuracy: number;
    tacklesPerGame: number;
    foulsPerGame: number;
    cornersPerGame: number;
}

export interface FootballMatch {
    id: string;
    sport: 'football';
    homeTeam: FootballTeam;
    awayTeam: FootballTeam;
    league: string;
    date: string;
    venue?: string;
}

export type Match = FootballMatch;

export interface FootballPrediction {
    homeWin: number;
    draw: number;
    awayWin: number;
    predictedScore: {
        home: number;
        away: number;
    };
    confidence: number;
    insights: string[];
}

export interface Prediction {
    sport: 'football';
    match: Match;
    predictedScore: {
        home: number;
        away: number;
    };
    confidence: number;
    winProbability: {
        home: number;
        draw: number;
        away: number;
    };
    keyFactors: string[];
    recommendation: string;
}