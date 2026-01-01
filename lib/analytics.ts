import { FootballTeam, BasketballTeam, FootballPrediction, BasketballPrediction } from '@/types';


// Statistical Models and AI Logic
export class SportsAnalytics {
    // Poisson Distribution for goal prediction
    static poissonProbability(lambda: number, k: number): number {
        return (Math.pow(lambda, k) * Math.exp(-lambda)) / this.factorial(k);
    }

    static factorial(n: number): number {
        if (n <= 1) return 1;
        return n * this.factorial(n - 1);
    }

    // Calculate Expected Goals (xG)
    static calculateXG(shotsOnTarget: number, totalShots: number, possession: number): number {
        const shotAccuracy = totalShots > 0 ? shotsOnTarget / totalShots : 0;
        const xG = (shotAccuracy * shotsOnTarget * (possession / 100)) / 10;
        return Math.max(0, Math.min(5, xG)); // Cap between 0-5
    }

    // Elo Rating System
    static calculateEloChange(ratingA: number, ratingB: number, actualScore: number, kFactor: number = 32): number {
        const expectedScore = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
        return kFactor * (actualScore - expectedScore);
    }

    // Weighted Recent Form
    static calculateFormScore(results: number[]): number {
        let score = 0;
        const weights = [0.35, 0.25, 0.20, 0.12, 0.08]; // Most recent games weighted more
        results.forEach((result, index) => {
            const weight = weights[index] || 0.05;
            score += result * weight;
        });
        return score;
    }

    // Match Outcome Prediction using multiple models
    static predictMatch(homeTeam: FootballTeam, awayTeam: FootballTeam): Omit<FootballPrediction, 'match'> {
        // Calculate goal expectancy using Poisson
        const homeGoalExpectancy = homeTeam.avgGoalsScored * 1.15; // Home advantage
        const awayGoalExpectancy = awayTeam.avgGoalsScored * 0.92;

        // Calculate probabilities for different scorelines
        let homeWinProb = 0;
        let drawProb = 0;
        let awayWinProb = 0;

        for (let homeGoals = 0; homeGoals <= 6; homeGoals++) {
            for (let awayGoals = 0; awayGoals <= 6; awayGoals++) {
                const prob = this.poissonProbability(homeGoalExpectancy, homeGoals) *
                    this.poissonProbability(awayGoalExpectancy, awayGoals);

                if (homeGoals > awayGoals) homeWinProb += prob;
                else if (homeGoals === awayGoals) drawProb += prob;
                else awayWinProb += prob;
            }
        }

        // Adjust with form and head-to-head
        const formDiff = homeTeam.formScore - awayTeam.formScore;
        const adjustment = formDiff * 0.15;

        homeWinProb += adjustment;
        awayWinProb -= adjustment;

        // Normalize probabilities
        const total = homeWinProb + drawProb + awayWinProb;
        homeWinProb /= total;
        drawProb /= total;
        awayWinProb /= total;

        // Over/Under prediction
        const expectedTotalGoals = homeGoalExpectancy + awayGoalExpectancy;
        const over25Prob = 1 - this.cumulativePoisson(expectedTotalGoals, 2);
        const bttsProb = (1 - this.poissonProbability(homeGoalExpectancy, 0)) *
            (1 - this.poissonProbability(awayGoalExpectancy, 0));

        return {
            homeWin: homeWinProb,
            draw: drawProb,
            awayWin: awayWinProb,
            over25: over25Prob,
            btts: bttsProb,
            expectedGoals: expectedTotalGoals,
            confidence: this.calculateConfidence(homeTeam, awayTeam)
        };
    }

    static cumulativePoisson(lambda: number, k: number): number {
        let sum = 0;
        for (let i = 0; i <= k; i++) {
            sum += this.poissonProbability(lambda, i);
        }
        return sum;
    }

    static calculateConfidence(homeTeam: FootballTeam | BasketballTeam, awayTeam: FootballTeam | BasketballTeam): number {
        const dataQuality = (homeTeam.matchesPlayed + awayTeam.matchesPlayed) / 20;
        const formConsistency = 1 - Math.abs(homeTeam.formScore - awayTeam.formScore) / 2;
        return Math.min(95, Math.max(60, (dataQuality * 0.4 + formConsistency * 0.6) * 100));
    }

    // Basketball Prediction
    static predictBasketball(homeTeam: BasketballTeam, awayTeam: BasketballTeam): Omit<BasketballPrediction, 'match'> {
        const homePPG = homeTeam.pointsPerGame * 1.08; // Home court advantage
        const awayPPG = awayTeam.pointsPerGame * 0.96;

        const homeDefRating = homeTeam.defensiveRating;
        const awayDefRating = awayTeam.defensiveRating;

        const expectedHomePoints = (homePPG * 0.6) + ((120 - awayDefRating) * 0.4);
        const expectedAwayPoints = (awayPPG * 0.6) + ((120 - homeDefRating) * 0.4);

        const pointDiff = expectedHomePoints - expectedAwayPoints;
        const homeWinProb = 1 / (1 + Math.exp(-pointDiff / 12));

        return {
            homeWin: homeWinProb,
            awayWin: 1 - homeWinProb,
            expectedHomePoints,
            expectedAwayPoints,
            spread: pointDiff,
            totalPoints: expectedHomePoints + expectedAwayPoints,
            confidence: this.calculateConfidence(homeTeam, awayTeam)
        };
    }
}

// Sample Data Generators
export const generateFootballTeam = (name: string, league: string, strength: number): FootballTeam => {
    const recentForm = Array.from({ length: 5 }, () => Math.random() < 0.3 + strength * 0.5 ? 3 : Math.random() < 0.5 ? 1 : 0);
    const possession = 45 + (strength * 15);
    const shotsOnTarget = 3 + (strength * 4);
    const totalShots = 10 + (strength * 8);

    return {
        name,
        league,
        elo: 1200 + (strength * 400),
        avgGoalsScored: 1.2 + (strength * 1.3),
        avgGoalsConceded: 2.0 - (strength * 1.2),
        homeWinRate: 0.35 + (strength * 0.40),
        awayWinRate: 0.20 + (strength * 0.30),
        recentForm,
        possession,
        shotsOnTarget,
        totalShots,
        defensiveStrength: 60 + (strength * 30),
        matchesPlayed: 10,
        get formScore() {
            return SportsAnalytics.calculateFormScore(this.recentForm);
        },
        get xG() {
            return SportsAnalytics.calculateXG(this.shotsOnTarget, this.totalShots, this.possession);
        }
    };
};

export const generateBasketballTeam = (name: string, league: string, strength: number): BasketballTeam => {
    const recentForm = Array.from({ length: 5 }, () => Math.random() < 0.3 + strength * 0.5 ? 1 : 0);

    return {
        name,
        league,
        pointsPerGame: 95 + (strength * 20),
        defensiveRating: 115 - (strength * 15),
        pace: 95 + (strength * 10),
        offensiveRating: 105 + (strength * 15),
        homeWinRate: 0.40 + (strength * 0.40),
        awayWinRate: 0.30 + (strength * 0.35),
        recentForm,
        matchesPlayed: 10,
        get formScore() {
            return this.recentForm.reduce((a, b) => a + b, 0) / this.recentForm.length;
        }
    };
};

// Type guard functions
export const isFootballPrediction = (prediction: any): prediction is FootballPrediction => {
    return 'draw' in prediction;
};

export const isFootballMatch = (match: any): match is import('@/types').FootballMatch => {
    return match.sport === 'football';
};

export const isBasketballMatch = (match: any): match is import('@/types').BasketballMatch => {
    return match.sport === 'basketball';
};