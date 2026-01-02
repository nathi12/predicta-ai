// lib/analytics.ts - Complete implementation with API data support

import {
    FootballTeam,
    FootballPrediction,
    FootballMatch,
} from '@/types';

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


// Export the SportsAnalytics class
export class SportsAnalytics {
    static predictMatch(homeTeam: FootballTeam, awayTeam: FootballTeam): FootballPrediction {
        const probabilities = calculateFootballWinProbability(homeTeam, awayTeam);
        const predictedScore = predictFootballScore(homeTeam, awayTeam);
        const insights = getFootballMatchInsights(homeTeam, awayTeam);
        const homeStrength = calculateFootballTeamStrength(homeTeam);
        const awayStrength = calculateFootballTeamStrength(awayTeam);
        const strengthDiff = Math.abs(homeStrength - awayStrength);
        const confidence = Math.min(95, Math.round(50 + (strengthDiff * 100)));

        return {
            homeWin: probabilities.homeWin,
            draw: probabilities.draw,
            awayWin: probabilities.awayWin,
            predictedScore: {
                home: predictedScore.homeScore,
                away: predictedScore.awayScore
            },
            confidence,
            insights
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