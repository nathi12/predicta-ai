// lib/analytics-improved.ts
// Enhanced predictions using REAL team statistics from API

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
 * Calculate betting markets probabilities using REAL team data
 */
export function calculateBettingMarkets(
    homeTeam: FootballTeam,
    awayTeam: FootballTeam,
    predictedScore: { home: number; away: number },
    confidence: number
): BettingMarkets {
    const totalGoals = predictedScore.home + predictedScore.away;

    // Calculate matches played from REAL data
    const homeMatches = homeTeam.wins + homeTeam.draws + homeTeam.losses;
    const awayMatches = awayTeam.wins + awayTeam.draws + awayTeam.losses;

    // REAL average goals per game for both teams
    const homeAvgGoalsScored = homeMatches > 0 ? homeTeam.goalsScored / homeMatches : 1.5;
    const awayAvgGoalsScored = awayMatches > 0 ? awayTeam.goalsScored / awayMatches : 1.5;
    const homeAvgGoalsConceded = homeMatches > 0 ? homeTeam.goalsConceded / homeMatches : 1.5;
    const awayAvgGoalsConceded = awayMatches > 0 ? awayTeam.goalsConceded / awayMatches : 1.5;

    // Combined attacking potential
    const expectedHomeGoals = (homeAvgGoalsScored + awayAvgGoalsConceded) / 2;
    const expectedAwayGoals = (awayAvgGoalsScored + homeAvgGoalsConceded) / 2;
    const expectedTotalGoals = expectedHomeGoals + expectedAwayGoals;

    console.log(`⚽ Goals Analysis for ${homeTeam.name} vs ${awayTeam.name}:`);
    console.log(`   Expected total goals: ${expectedTotalGoals.toFixed(2)}`);
    console.log(`   Home avg: ${homeAvgGoalsScored.toFixed(2)} scored, ${homeAvgGoalsConceded.toFixed(2)} conceded`);
    console.log(`   Away avg: ${awayAvgGoalsScored.toFixed(2)} scored, ${awayAvgGoalsConceded.toFixed(2)} conceded`);

    // Over 1.5 Goals - More accurate with real data
    let over15Prob = 50;
    if (expectedTotalGoals >= 3.0) over15Prob = 85;
    else if (expectedTotalGoals >= 2.5) over15Prob = 75;
    else if (expectedTotalGoals >= 2.0) over15Prob = 65;
    else if (expectedTotalGoals >= 1.5) over15Prob = 55;
    else over15Prob = 40;

    // Over 2.5 Goals
    let over25Prob = 50;
    if (expectedTotalGoals >= 3.5) over25Prob = 75;
    else if (expectedTotalGoals >= 3.0) over25Prob = 65;
    else if (expectedTotalGoals >= 2.5) over25Prob = 55;
    else if (expectedTotalGoals >= 2.0) over25Prob = 45;
    else over25Prob = 30;

    // Over 3.5 Goals
    let over35Prob = 40;
    if (expectedTotalGoals >= 4.0) over35Prob = 65;
    else if (expectedTotalGoals >= 3.5) over35Prob = 55;
    else if (expectedTotalGoals >= 3.0) over35Prob = 45;
    else if (expectedTotalGoals >= 2.5) over35Prob = 35;
    else over35Prob = 25;

    // BTTS (Both Teams To Score) - Using REAL attacking/defensive data
    let bttsProb = 45;

    // Both teams have good attacking records
    if (homeAvgGoalsScored >= 1.5 && awayAvgGoalsScored >= 1.5) {
        bttsProb += 15;
    } else if (homeAvgGoalsScored >= 1.2 && awayAvgGoalsScored >= 1.2) {
        bttsProb += 10;
    } else if (homeAvgGoalsScored < 0.8 || awayAvgGoalsScored < 0.8) {
        bttsProb -= 10;
    }

    // Both teams have weak defenses
    if (homeAvgGoalsConceded >= 1.5 && awayAvgGoalsConceded >= 1.5) {
        bttsProb += 10;
    } else if (homeAvgGoalsConceded >= 1.2 && awayAvgGoalsConceded >= 1.2) {
        bttsProb += 5;
    }

    // Strong defense reduces BTTS chance
    if (homeAvgGoalsConceded < 0.8 || awayAvgGoalsConceded < 0.8) {
        bttsProb -= 10;
    }

    bttsProb = Math.max(20, Math.min(90, bttsProb));

    console.log(`   BTTS probability: ${bttsProb.toFixed(1)}%`);

    // Corners Markets - Using REAL corners data
    const totalExpectedCorners = homeTeam.cornersPerGame + awayTeam.cornersPerGame;

    console.log(`📊 Corners Analysis:`);
    console.log(`   Home corners/game: ${homeTeam.cornersPerGame}`);
    console.log(`   Away corners/game: ${awayTeam.cornersPerGame}`);
    console.log(`   Total expected: ${totalExpectedCorners.toFixed(1)}`);

    // Over 6.5 Corners - Refined calculation
    let over65Prob = 50;
    if (totalExpectedCorners >= 12) over65Prob = 85;
    else if (totalExpectedCorners >= 11) over65Prob = 75;
    else if (totalExpectedCorners >= 10) over65Prob = 70;
    else if (totalExpectedCorners >= 9) over65Prob = 65;
    else if (totalExpectedCorners >= 8) over65Prob = 60;
    else if (totalExpectedCorners >= 7) over65Prob = 55;
    else if (totalExpectedCorners >= 6) over65Prob = 45;
    else over65Prob = 35;

    // Over 8.5 Corners
    let over85Prob = 40;
    if (totalExpectedCorners >= 13) over85Prob = 75;
    else if (totalExpectedCorners >= 12) over85Prob = 70;
    else if (totalExpectedCorners >= 11) over85Prob = 65;
    else if (totalExpectedCorners >= 10) over85Prob = 60;
    else if (totalExpectedCorners >= 9) over85Prob = 50;
    else if (totalExpectedCorners >= 8) over85Prob = 40;
    else over85Prob = 30;

    // Over 10.5 Corners
    let over105Prob = 30;
    if (totalExpectedCorners >= 14) over105Prob = 70;
    else if (totalExpectedCorners >= 13) over105Prob = 65;
    else if (totalExpectedCorners >= 12) over105Prob = 60;
    else if (totalExpectedCorners >= 11) over105Prob = 50;
    else if (totalExpectedCorners >= 10) over105Prob = 40;
    else over105Prob = 25;

    return {
        over15Goals: {
            probability: Math.round(over15Prob * 10) / 10,
            recommended: over15Prob >= 65 && confidence >= 65
        },
        over25Goals: {
            probability: Math.round(over25Prob * 10) / 10,
            recommended: over25Prob >= 60 && confidence >= 65
        },
        over35Goals: {
            probability: Math.round(over35Prob * 10) / 10,
            recommended: over35Prob >= 55 && confidence >= 70
        },
        btts: {
            probability: Math.round(bttsProb * 10) / 10,
            recommended: bttsProb >= 60 && confidence >= 65
        },
        corners: {
            over65: {
                probability: Math.round(over65Prob * 10) / 10,
                recommended: over65Prob >= 65 && confidence >= 65
            },
            over85: {
                probability: Math.round(over85Prob * 10) / 10,
                recommended: over85Prob >= 60 && confidence >= 65
            },
            over105: {
                probability: Math.round(over105Prob * 10) / 10,
                recommended: over105Prob >= 55 && confidence >= 70
            }
        }
    };
}

/**
 * Calculate win probability for a football match using REAL data
 */
export function calculateFootballWinProbability(
    homeTeam: FootballTeam,
    awayTeam: FootballTeam
): { homeWin: number; draw: number; awayWin: number } {
    // Calculate team strength scores from REAL data
    const homeStrength = calculateFootballTeamStrength(homeTeam);
    const awayStrength = calculateFootballTeamStrength(awayTeam);

    console.log(`\n🎯 Prediction for ${homeTeam.name} vs ${awayTeam.name}`);
    console.log(`   Home strength: ${(homeStrength * 100).toFixed(1)}%`);
    console.log(`   Away strength: ${(awayStrength * 100).toFixed(1)}%`);

    // Home advantage factor (8% boost based on statistical analysis)
    const homeAdvantage = 1.08;
    const adjustedHomeStrength = homeStrength * homeAdvantage;

    // Calculate raw probabilities
    const total = adjustedHomeStrength + awayStrength;
    let homeWinProb = (adjustedHomeStrength / total) * 100;
    let awayWinProb = (awayStrength / total) * 100;

    // Draw probability based on team closeness and league averages
    const strengthDifference = Math.abs(homeStrength - awayStrength);
    let drawProb = Math.max(20, 28 - (strengthDifference * 40)); // 20-28% draw chance

    // Teams with similar form tend to draw more
    const homeFormScore = calculateFormScore(homeTeam.form);
    const awayFormScore = calculateFormScore(awayTeam.form);
    if (Math.abs(homeFormScore - awayFormScore) < 1) {
        drawProb += 3; // Increase draw probability for evenly matched teams
    }

    // Normalize to 100%
    const totalProb = homeWinProb + drawProb + awayWinProb;
    homeWinProb = (homeWinProb / totalProb) * 100;
    drawProb = (drawProb / totalProb) * 100;
    awayWinProb = (awayWinProb / totalProb) * 100;

    console.log(`   Probabilities: ${homeWinProb.toFixed(1)}% / ${drawProb.toFixed(1)}% / ${awayWinProb.toFixed(1)}%`);

    return {
        homeWin: Math.round(homeWinProb * 10) / 10,
        draw: Math.round(drawProb * 10) / 10,
        awayWin: Math.round(awayWinProb * 10) / 10
    };
}

/**
 * Calculate overall team strength using REAL statistics
 */
function calculateFootballTeamStrength(team: FootballTeam): number {
    const totalMatches = team.wins + team.draws + team.losses;

    // If no matches played, use moderate default
    if (totalMatches === 0) {
        console.warn(`⚠️ No match data for ${team.name}, using default strength`);
        return 0.5;
    }

    // 1. Win rate with draws counted as 0.5 (30% weight)
    const points = (team.wins * 3) + (team.draws * 1);
    const maxPoints = totalMatches * 3;
    const pointsRatio = points / maxPoints;

    // 2. Goal difference normalized (20% weight)
    const goalDiff = team.goalsScored - team.goalsConceded;
    const goalDiffPerGame = goalDiff / totalMatches;
    const goalDiffScore = Math.max(0, Math.min(1, (goalDiffPerGame + 2) / 4)); // Normalize to 0-1

    // 3. Recent form (20% weight)
    const formScore = calculateFormScore(team.form) / 5; // Normalize to 0-1

    // 4. Attacking strength (15% weight)
    const goalsPerGame = team.goalsScored / totalMatches;
    const attackScore = Math.min(1, goalsPerGame / 2.5); // 2.5 goals/game = max score

    // 5. Defensive strength (15% weight)
    const goalsConcededPerGame = team.goalsConceded / totalMatches;
    const defenseScore = Math.max(0, 1 - (goalsConcededPerGame / 2)); // Lower conceded = higher score

    // Weighted combination
    const strength = (
        pointsRatio * 0.30 +
        goalDiffScore * 0.20 +
        formScore * 0.20 +
        attackScore * 0.15 +
        defenseScore * 0.15
    );

    const finalStrength = Math.max(0.2, Math.min(0.95, strength)); // Clamp between 0.2 and 0.95

    console.log(`   ${team.name} detailed strength:`);
    console.log(`     Points: ${points}/${maxPoints} (${(pointsRatio * 100).toFixed(1)}%)`);
    console.log(`     Goal diff: ${goalDiff >= 0 ? '+' : ''}${goalDiff} (${(goalDiffScore * 100).toFixed(1)}%)`);
    console.log(`     Form: ${team.form} (${(formScore * 100).toFixed(1)}%)`);
    console.log(`     Final strength: ${(finalStrength * 100).toFixed(1)}%`);

    return finalStrength;
}

/**
 * Calculate score from form string using REAL form data
 */
function calculateFormScore(form: string): number {
    if (!form || form === 'N/A') return 2.5; // Default to average

    let score = 0;
    const formArray = form.split(',');

    for (const result of formArray) {
        if (result === 'W') score += 1;
        else if (result === 'D') score += 0.5;
        // L = 0 points
    }

    return score;
}

/**
 * Predict score using REAL team statistics
 */
export function predictFootballScore(
    homeTeam: FootballTeam,
    awayTeam: FootballTeam
): { homeScore: number; awayScore: number } {
    const homeMatches = homeTeam.wins + homeTeam.draws + homeTeam.losses;
    const awayMatches = awayTeam.wins + awayTeam.draws + awayTeam.losses;

    // REAL average goals
    const homeAvgScored = homeMatches > 0 ? homeTeam.goalsScored / homeMatches : 1.2;
    const awayAvgScored = awayMatches > 0 ? awayTeam.goalsScored / awayMatches : 1.2;
    const homeAvgConceded = homeMatches > 0 ? homeTeam.goalsConceded / homeMatches : 1.2;
    const awayAvgConceded = awayMatches > 0 ? awayTeam.goalsConceded / awayMatches : 1.2;

    // Predict based on attack vs defense
    const homeExpected = (homeAvgScored + awayAvgConceded) / 2 * 1.1; // Home advantage
    const awayExpected = (awayAvgScored + homeAvgConceded) / 2 * 0.95; // Away disadvantage

    // Round to realistic scores
    let homeScore = Math.round(homeExpected);
    let awayScore = Math.round(awayExpected);

    // Ensure at least some variance but keep realistic
    homeScore = Math.max(0, Math.min(4, homeScore));
    awayScore = Math.max(0, Math.min(4, awayScore));

    console.log(`   Predicted score: ${homeScore}-${awayScore}`);

    return {
        homeScore,
        awayScore
    };
}

/**
 * Get match insights using REAL statistics
 */
export function getFootballMatchInsights(
    homeTeam: FootballTeam,
    awayTeam: FootballTeam
): string[] {
    const insights: string[] = [];

    const homeMatches = homeTeam.wins + homeTeam.draws + homeTeam.losses;
    const awayMatches = awayTeam.wins + awayTeam.draws + awayTeam.losses;

    // Form comparison using REAL form data
    if (homeTeam.form !== 'N/A' && awayTeam.form !== 'N/A') {
        const homeFormScore = calculateFormScore(homeTeam.form);
        const awayFormScore = calculateFormScore(awayTeam.form);

        if (homeFormScore >= 4 && awayFormScore <= 2) {
            insights.push(`${homeTeam.name} in excellent form (${homeTeam.form})`);
        } else if (awayFormScore >= 4 && homeFormScore <= 2) {
            insights.push(`${awayTeam.name} in excellent form (${awayTeam.form})`);
        } else if (Math.abs(homeFormScore - awayFormScore) < 0.5) {
            insights.push(`Both teams in similar form`);
        }
    }

    // Goal scoring using REAL data
    const homeGoalsPerGame = homeMatches > 0 ? homeTeam.goalsScored / homeMatches : 0;
    const awayGoalsPerGame = awayMatches > 0 ? awayTeam.goalsScored / awayMatches : 0;

    if (homeGoalsPerGame >= 2.0) {
        insights.push(`${homeTeam.name} averaging ${homeGoalsPerGame.toFixed(1)} goals per game`);
    }
    if (awayGoalsPerGame >= 2.0) {
        insights.push(`${awayTeam.name} averaging ${awayGoalsPerGame.toFixed(1)} goals per game`);
    }

    // Defense using REAL data
    const homeConcededPerGame = homeMatches > 0 ? homeTeam.goalsConceded / homeMatches : 0;
    const awayConcededPerGame = awayMatches > 0 ? awayTeam.goalsConceded / awayMatches : 0;

    if (homeConcededPerGame < 0.8) {
        insights.push(`${homeTeam.name} has strong defense (${homeConcededPerGame.toFixed(1)} conceded/game)`);
    }
    if (awayConcededPerGame < 0.8) {
        insights.push(`${awayTeam.name} has strong defense (${awayConcededPerGame.toFixed(1)} conceded/game)`);
    }

    // Win rate
    const homeWinRate = homeMatches > 0 ? (homeTeam.wins / homeMatches * 100) : 0;
    const awayWinRate = awayMatches > 0 ? (awayTeam.wins / awayMatches * 100) : 0;

    if (homeWinRate >= 60) {
        insights.push(`${homeTeam.name} winning ${homeWinRate.toFixed(0)}% of matches`);
    }
    if (awayWinRate >= 60) {
        insights.push(`${awayTeam.name} winning ${awayWinRate.toFixed(0)}% of matches`);
    }

    return insights.slice(0, 3); // Return max 3 insights
}

/**
 * Extended Football Prediction with Betting Markets
 */
export interface ExtendedFootballPrediction extends FootballPrediction {
    bettingMarkets: BettingMarkets;
}

/**
 * Main prediction class using REAL statistics
 */
export class SportsAnalytics {
    static predictMatch(homeTeam: FootballTeam, awayTeam: FootballTeam): ExtendedFootballPrediction {
        console.log(`\n🔮 Generating AI Prediction...`);

        const probabilities = calculateFootballWinProbability(homeTeam, awayTeam);
        const predictedScore = predictFootballScore(homeTeam, awayTeam);
        const insights = getFootballMatchInsights(homeTeam, awayTeam);

        const homeStrength = calculateFootballTeamStrength(homeTeam);
        const awayStrength = calculateFootballTeamStrength(awayTeam);
        const strengthDiff = Math.abs(homeStrength - awayStrength);

        // Confidence based on data quality and strength difference
        const homeMatches = homeTeam.wins + homeTeam.draws + homeTeam.losses;
        const awayMatches = awayTeam.wins + awayTeam.draws + awayTeam.losses;
        const dataQuality = Math.min(homeMatches, awayMatches) >= 10 ? 1.0 : 0.85;
        const baseConfidence = 50 + (strengthDiff * 80);
        const confidence = Math.min(95, Math.round(baseConfidence * dataQuality));

        console.log(`   Confidence: ${confidence}% (data quality: ${(dataQuality * 100).toFixed(0)}%)`);

        const bettingMarkets = calculateBettingMarkets(
            homeTeam,
            awayTeam,
            { home: predictedScore.homeScore, away: predictedScore.awayScore },
            confidence
        );

        console.log(`✅ Prediction complete\n`);

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