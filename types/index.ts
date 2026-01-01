// Type Definitions for Sports Analytics Platform

export interface FootballTeam {
    name: string;
    league: string;
    elo: number;
    avgGoalsScored: number;
    avgGoalsConceded: number;
    homeWinRate: number;
    awayWinRate: number;
    recentForm: number[];
    possession: number;
    shotsOnTarget: number;
    totalShots: number;
    defensiveStrength: number;
    matchesPlayed: number;
    formScore: number;
    xG: number;
}

export interface BasketballTeam {
    name: string;
    league: string;
    pointsPerGame: number;
    defensiveRating: number;
    pace: number;
    offensiveRating: number;
    homeWinRate: number;
    awayWinRate: number;
    recentForm: number[];
    matchesPlayed: number;
    formScore: number;
}

export interface FootballMatch {
    id: number;
    sport: 'football';
    league: string;
    homeTeam: FootballTeam;
    awayTeam: FootballTeam;
    date: string;
    time: string;
}

export interface BasketballMatch {
    id: number;
    sport: 'basketball';
    league: string;
    homeTeam: BasketballTeam;
    awayTeam: BasketballTeam;
    date: string;
    time: string;
}

export type Match = FootballMatch | BasketballMatch;

export interface FootballPrediction {
    homeWin: number;
    draw: number;
    awayWin: number;
    over25: number;
    btts: number;
    expectedGoals: number;
    confidence: number;
    match: FootballMatch;
}

export interface BasketballPrediction {
    homeWin: number;
    awayWin: number;
    expectedHomePoints: number;
    expectedAwayPoints: number;
    spread: number;
    totalPoints: number;
    confidence: number;
    match: BasketballMatch;
}

export type Prediction = FootballPrediction | BasketballPrediction;

export type SportFilter = 'all' | 'football' | 'basketball';