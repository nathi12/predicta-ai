// lib/analytics.ts - Complete implementation with API data support and betting markets

import {
    FootballTeam,
    FootballPrediction,
    FootballMatch,
} from '@/types';

/**
 * Betting Markets Interface
 */
export interface BettingMarkets {
    over15Goals: { probability: number; recommended: boolean };
    over25Goals: { probability: number; recommended: boolean };
    over35Goals: { probability: number; recommended: boolean };
    btts: { probability: number; recommended: boolean }; // Both Teams To Score
    corners: {
        over65: { probability: number; recommended: boolean };
        over85: { probability: number; recommended: boolean };
        over105: { probability: number; recommended: boolean };
    };
}

/**
 * Calculate betting markets probabilities
 * Uses team statistics and predicted score to estimate market outcomes
 */
export function calculateBettingMarkets(
    homeTeam: FootballTeam,
    awayTeam: FootballTeam,
    predictedScore: { home: number; away: number },
    confidence: number
): BettingMarkets {
    const totalGoals = predictedScore.home + predictedScore.away;

    // Calculate matches played
    const homeMatches = homeTeam.wins + homeTeam.draws + homeTeam.losses;
    const awayMatches = awayTeam.wins + awayTeam.draws + awayTeam.losses;
    const totalMatches = homeMatches + awayMatches;

    // Average goals per game for both teams combined
    const avgGoals = totalMatches > 0
        ? (homeTeam.goalsScored + awayTeam.goalsScored) / totalMatches * 2
        : 2.5; // Default average

    // Goals Markets - Enhanced with team statistics
    // Over 1.5 Goals
    const over15BaseProb = totalGoals >= 2 ? 70 : 40;
    const over15Adjustment = avgGoals > 2.5 ? 10 : -5;
    const over15Prob = Math.max(30, Math.min(95, over15BaseProb + over15Adjustment + (Math.random() * 10 - 5)));

    // Over 2.5 Goals
    const over25BaseProb = totalGoals >= 3 ? 60 : 35;
    const over25Adjustment = avgGoals > 3 ? 10 : -5;
    const over25Prob = Math.max(20, Math.min(90, over25BaseProb + over25Adjustment + (Math.random() * 10 - 5)));

    // Over 3.5 Goals
    const over35BaseProb = totalGoals >= 4 ? 45 : 25;
    const over35Adjustment = avgGoals > 3.5 ? 10 : -5;
    const over35Prob = Math.max(15, Math.min(85, over35BaseProb + over35Adjustment + (Math.random() * 10 - 5)));

    // BTTS (Both Teams To Score)
    // Consider attacking and defensive stats
    const homeAvgScored = homeMatches > 0 ? homeTeam.goalsScored / homeMatches : 1;
    const awayAvgScored = awayMatches > 0 ? awayTeam.goalsScored / awayMatches : 1;
    const homeAvgConceded = homeMatches > 0 ? homeTeam.goalsConceded / homeMatches : 1;
    const awayAvgConceded = awayMatches > 0 ? awayTeam.goalsConceded / awayMatches : 1;

    let bttsProb = 45; // Base probability

    if (predictedScore.home > 0 && predictedScore.away > 0) {
        bttsProb = 60;
    }

    // Adjust based on attacking prowess
    if (homeAvgScored > 1.2 && awayAvgScored > 1.2) {
        bttsProb += 10;
    }

    // Adjust based on defensive weakness
    if (homeAvgConceded > 1 && awayAvgConceded > 1) {
        bttsProb += 5;
    }

    bttsProb = Math.max(20, Math.min(90, bttsProb + (Math.random() * 10 - 5)));

    // Corners Markets - UPDATED TO USE ACTUAL CORNERS DATA
    // Total expected corners combining both teams
    const totalExpectedCorners = homeTeam.cornersPerGame + awayTeam.cornersPerGame;

    console.log(`📊 Corners Analysis for ${homeTeam.name} vs ${awayTeam.name}:`);
    console.log(`   Home corners/game: ${homeTeam.cornersPerGame}`);
    console.log(`   Away corners/game: ${awayTeam.cornersPerGame}`);
    console.log(`   Total expected: ${totalExpectedCorners}`);

    // Over 6.5 Corners - More sophisticated calculation
    let over65BaseProb = 50;
    if (totalExpectedCorners >= 10) over65BaseProb = 75;
    else if (totalExpectedCorners >= 8) over65BaseProb = 65;
    else if (totalExpectedCorners >= 7) over65BaseProb = 55;
    else if (totalExpectedCorners < 6) over65BaseProb = 35;

    const over65Prob = Math.max(25, Math.min(95, over65BaseProb + (Math.random() * 8 - 4)));

    // Over 8.5 Corners
    let over85BaseProb = 40;
    if (totalExpectedCorners >= 12) over85BaseProb = 70;
    else if (totalExpectedCorners >= 10) over85BaseProb = 60;
    else if (totalExpectedCorners >= 9) over85BaseProb = 50;
    else if (totalExpectedCorners < 7) over85BaseProb = 25;

    const over85Prob = Math.max(20, Math.min(90, over85BaseProb + (Math.random() * 8 - 4)));

    // Over 10.5 Corners
    let over105BaseProb = 30;
    if (totalExpectedCorners >= 14) over105BaseProb = 65;
    else if (totalExpectedCorners >= 12) over105BaseProb = 55;
    else if (totalExpectedCorners >= 11) over105BaseProb = 45;
    else if (totalExpectedCorners < 9) over105BaseProb = 20;

    const over105Prob = Math.max(15, Math.min(85, over105BaseProb + (Math.random() * 8 - 4)));

    return {
        over15Goals: {
            probability: Math.round(over15Prob * 10) / 10,
            recommended: over15Prob > 60 && confidence > 65
        },
        over25Goals: {
            probability: Math.round(over25Prob * 10) / 10,
            recommended: over25Prob > 55 && confidence > 65
        },
        over35Goals: {
            probability: Math.round(over35Prob * 10) / 10,
            recommended: over35Prob > 45 && confidence > 70
        },
        btts: {
            probability: Math.round(bttsProb * 10) / 10,
            recommended: bttsProb > 55 && confidence > 65
        },
        corners: {
            over65: {
                probability: Math.round(over65Prob * 10) / 10,
                recommended: over65Prob > 60 && confidence > 65
            },
            over85: {
                probability: Math.round(over85Prob * 10) / 10,
                recommended: over85Prob > 55 && confidence > 65
            },
            over105: {
                probability: Math.round(over105Prob * 10) / 10,
                recommended: over105Prob > 50 && confidence > 70
            }
        }
    };
}

/**
 * Generate football team statistics
 * This can be used as a fallback when API data is unavailable
 * or for testing purposes
 */
export function generateFootballTeam(
    name: string,
    league: string,
    strength: number,
    logo?: string
): FootballTeam {
    // Strength should be between 0 and 1
    const normalizedStrength = Math.max(0, Math.min(1, strength));

    // Generate form based on strength (e.g., "WWDWL")
    const form = generateForm(normalizedStrength, 5);

    // Calculate stats based on team strength
    const baseGoalsScored = Math.round(40 + (normalizedStrength * 40)); // 40-80 goals
    const baseGoalsConceded = Math.round(60 - (normalizedStrength * 40)); // 20-60 goals

    const totalMatches = 25; // Assume 25 matches played
    const wins = Math.round(totalMatches * normalizedStrength * 0.7);
    const losses = Math.round(totalMatches * (1 - normalizedStrength) * 0.6);
    const draws = totalMatches - wins - losses;

    return {
        name,
        logo,
        league,
        form,
        goalsScored: baseGoalsScored,
        goalsConceded: baseGoalsConceded,
        wins,
        draws: Math.max(0, draws),
        losses: Math.max(0, losses),
        averagePossession: Math.round(45 + (normalizedStrength * 15)), // 45-60%
        shotsPerGame: Math.round(10 + (normalizedStrength * 10)), // 10-20 shots
        shotsOnTargetPerGame: Math.round(4 + (normalizedStrength * 6)), // 4-10 shots on target
        passAccuracy: Math.round(70 + (normalizedStrength * 20)), // 70-90%
        tacklesPerGame: Math.round(15 + (normalizedStrength * 10)), // 15-25 tackles
        foulsPerGame: Math.round(12 - (normalizedStrength * 3)), // 9-12 fouls (better teams foul less)
        cornersPerGame: Math.round(5 + (normalizedStrength * 5)) // 5-10 corners
    };
}

/**
 * Generate a form string (e.g., "WWDLW" for last 5 matches)
 * W = Win, D = Draw (football only), L = Loss
 */
function generateForm(strength: number, length: number = 5): string {
    const form: string[] = [];
    const hasDraws = true; // Set to false for basketball

    for (let i = 0; i < length; i++) {
        const random = Math.random();

        if (hasDraws) {
            // Football: W, D, L
            if (random < strength * 0.7) {
                form.push('W');
            } else if (random < strength * 0.7 + 0.2) {
                form.push('D');
            } else {
                form.push('L');
            }
        } else {
            // Basketball: W, L only
            if (random < strength) {
                form.push('W');
            } else {
                form.push('L');
            }
        }
    }

    return form.join('');
}

/**
 * Calculate win probability for a football match
 */
export function calculateFootballWinProbability(
    homeTeam: FootballTeam,
    awayTeam: FootballTeam
): { homeWin: number; draw: number; awayWin: number } {
    // Calculate team strength scores
    const homeStrength = calculateFootballTeamStrength(homeTeam);
    const awayStrength = calculateFootballTeamStrength(awayTeam);

    // Home advantage factor (typically 5-10% boost)
    const homeAdvantage = 1.08;
    const adjustedHomeStrength = homeStrength * homeAdvantage;

    // Calculate raw probabilities
    const total = adjustedHomeStrength + awayStrength;
    let homeWinProb = (adjustedHomeStrength / total) * 100;
    let awayWinProb = (awayStrength / total) * 100;

    // Draw probability is inversely related to strength difference
    const strengthDifference = Math.abs(homeStrength - awayStrength);
    let drawProb = Math.max(15, 30 - (strengthDifference * 50)); // 15-30% draw chance

    // Normalize to 100%
    const totalProb = homeWinProb + drawProb + awayWinProb;
    homeWinProb = (homeWinProb / totalProb) * 100;
    drawProb = (drawProb / totalProb) * 100;
    awayWinProb = (awayWinProb / totalProb) * 100;

    return {
        homeWin: Math.round(homeWinProb * 10) / 10,
        draw: Math.round(drawProb * 10) / 10,
        awayWin: Math.round(awayWinProb * 10) / 10
    };
}

/**
 * Calculate overall team strength for football
 */
function calculateFootballTeamStrength(team: FootballTeam): number {
    const totalMatches = team.wins + team.draws + team.losses;
    if (totalMatches === 0) return 0.5; // Default to 0.5 if no matches

    // Weighted factors
    const winRate = team.wins / totalMatches;
    const goalDifference = (team.goalsScored - team.goalsConceded) / totalMatches;
    const formScore = calculateFormScore(team.form) / 5; // Normalize to 0-1
    const possessionScore = team.averagePossession / 100;
    const shotAccuracy = team.shotsOnTargetPerGame / Math.max(1, team.shotsPerGame);
    const passScore = team.passAccuracy / 100;

    // Weighted average of all factors
    const strength = (
        winRate * 0.30 +
        (goalDifference + 1) / 3 * 0.20 + // Normalize goal difference
        formScore * 0.20 +
        possessionScore * 0.10 +
        shotAccuracy * 0.10 +
        passScore * 0.10
    );

    return Math.max(0, Math.min(1, strength)); // Clamp between 0 and 1
}

/**
 * Calculate score from form string
 * W = 1 point, D = 0.5 points, L = 0 points
 */
function calculateFormScore(form: string): number {
    if (!form || form === 'N/A') return 2.5; // Default to average

    let score = 0;
    for (const result of form) {
        if (result === 'W') score += 1;
        else if (result === 'D') score += 0.5;
        // L = 0 points
    }
    return score;
}

/**
 * Predict score for football match
 */
export function predictFootballScore(
    homeTeam: FootballTeam,
    awayTeam: FootballTeam
): { homeScore: number; awayScore: number } {
    const homeStrength = calculateFootballTeamStrength(homeTeam);
    const awayStrength = calculateFootballTeamStrength(awayTeam);

    // Average goals per game for each team
    const homeAvgGoals = homeTeam.goalsScored / Math.max(1, homeTeam.wins + homeTeam.draws + homeTeam.losses);
    const awayAvgGoals = awayTeam.goalsScored / Math.max(1, awayTeam.wins + awayTeam.draws + awayTeam.losses);

    // Predict goals with strength modifiers and home advantage
    const homeScore = Math.round((homeAvgGoals * homeStrength * 1.1) + Math.random() * 0.5);
    const awayScore = Math.round((awayAvgGoals * awayStrength * 0.95) + Math.random() * 0.5);

    return {
        homeScore: Math.max(0, homeScore),
        awayScore: Math.max(0, awayScore)
    };
}

/**
 * Get match insights and key stats
 */
export function getFootballMatchInsights(
    homeTeam: FootballTeam,
    awayTeam: FootballTeam
): string[] {
    const insights: string[] = [];

    // Form comparison
    const homeFormScore = calculateFormScore(homeTeam.form);
    const awayFormScore = calculateFormScore(awayTeam.form);
    if (homeFormScore > awayFormScore + 1) {
        insights.push(`${homeTeam.name} is in better form with ${homeTeam.form}`);
    } else if (awayFormScore > homeFormScore + 1) {
        insights.push(`${awayTeam.name} is in better form with ${awayTeam.form}`);
    }

    // Goal scoring
    if (homeTeam.goalsScored > awayTeam.goalsScored * 1.3) {
        insights.push(`${homeTeam.name} has scored significantly more goals this season`);
    } else if (awayTeam.goalsScored > homeTeam.goalsScored * 1.3) {
        insights.push(`${awayTeam.name} has scored significantly more goals this season`);
    }

    // Defense
    if (homeTeam.goalsConceded < awayTeam.goalsConceded * 0.7) {
        insights.push(`${homeTeam.name} has a much stronger defense`);
    } else if (awayTeam.goalsConceded < homeTeam.goalsConceded * 0.7) {
        insights.push(`${awayTeam.name} has a much stronger defense`);
    }

    // Possession
    if (Math.abs(homeTeam.averagePossession - awayTeam.averagePossession) > 10) {
        const dominantTeam = homeTeam.averagePossession > awayTeam.averagePossession ? homeTeam : awayTeam;
        insights.push(`${dominantTeam.name} typically dominates possession`);
    }

    return insights;
}

/**
 * Extended Football Prediction with Betting Markets
 */
export interface ExtendedFootballPrediction extends FootballPrediction {
    bettingMarkets: BettingMarkets;
}

// Export the SportsAnalytics class with betting markets
// In lib/analytics.ts - Update the predictMatch method

export class SportsAnalytics {
    static predictMatch(homeTeam: FootballTeam, awayTeam: FootballTeam): ExtendedFootballPrediction {
        const probabilities = calculateFootballWinProbability(homeTeam, awayTeam);
        const predictedScore = predictFootballScore(homeTeam, awayTeam);
        const insights = getFootballMatchInsights(homeTeam, awayTeam);
        const homeStrength = calculateFootballTeamStrength(homeTeam);
        const awayStrength = calculateFootballTeamStrength(awayTeam);
        const strengthDiff = Math.abs(homeStrength - awayStrength);
        const confidence = Math.min(95, Math.round(50 + (strengthDiff * 100)));

        // Calculate betting markets - FIX: Transform the predicted score format
        const bettingMarkets = calculateBettingMarkets(
            homeTeam,
            awayTeam,
            { home: predictedScore.homeScore, away: predictedScore.awayScore }, // <-- FIX HERE
            confidence
        );

        return {
            homeWin: probabilities.homeWin,
            draw: probabilities.draw,
            awayWin: probabilities.awayWin,
            predictedScore: {
                home: predictedScore.homeScore,
                away: predictedScore.awayScore
            },
            confidence,
            insights,
            bettingMarkets
        };
    }
}

// Type Guards
export function isFootballPrediction(prediction: any): prediction is FootballPrediction {
    return 'draw' in prediction && typeof prediction.draw === 'number';
}

export function isFootballMatch(match: any): match is FootballMatch {
    return match.sport === 'football';
}