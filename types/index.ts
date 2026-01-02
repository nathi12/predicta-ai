// types/index.ts or src/types/index.ts

export type SportFilter = 'all' | 'football';

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
    id: string | number;
    sport: 'football';
    league: string;
    homeTeam: FootballTeam;
    awayTeam: FootballTeam;
    date: string;
    time: string;
    venue?: string;
    status?: string;
}

export type Match = FootballMatch;

export interface Prediction {
    match: Match;
    winProbability: {
        home: number;
        draw: number;
        away: number;
    };
    predictedScore: {
        home: number;
        away: number;
    };
    confidence: number;
    keyFactors: string[];
    recommendation: string;
}

export interface TeamStats {
    name: string;
    avgGoalsScored: number;
    defensiveStrength: number;
    formScore: number;
    xG: number;
    possession: number;
    homeWinRate?: number;
    awayWinRate?: number;
}

// export interface Match {
//     homeTeam: TeamStats;
//     awayTeam: TeamStats;
// }

export interface FootballPrediction {
    match: Match;
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    btts: number;
    expectedGoals: number;
}