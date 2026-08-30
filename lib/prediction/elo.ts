// lib/prediction/elo.ts
// Lightweight Elo ratings. Seeds are derived from current-season standings
// (points-per-game + goal difference) by the caller, then refined here by
// replaying this season's finished results with a goal-difference-aware K.

const K0 = 20;

export interface FinishedResult {
    homeId: number;
    awayId: number;
    homeGoals: number;
    awayGoals: number;
    kickoff: string;
}

/**
 * Convert a team's season record into a starting Elo. The offset from 1500 is
 * trusted in proportion to games played, so a 2-game sample barely moves the
 * needle (avoids everyone pinning to a clamp in August).
 */
export function seedFromRecord(
    points: number,
    played: number,
    goalsFor: number,
    goalsAgainst: number,
): number {
    if (played <= 0) return 1500;
    const ppg = points / played;
    const gdpg = (goalsFor - goalsAgainst) / played;
    const raw = (ppg - 1.35) * 150 + gdpg * 55;
    const trust = played / (played + 8); // 2 games => 0.20, 10 => 0.56
    const rating = 1500 + raw * trust;
    return Math.max(1330, Math.min(1720, rating));
}

/** Expected home score share (draw counts 0.5), 0..1. */
export function expectedScore(homeElo: number, awayElo: number, homeAdvantage: number): number {
    const dr = homeElo + homeAdvantage - awayElo;
    return 1 / (1 + 10 ** (-dr / 400));
}

function goalMultiplier(goalDiff: number, eloDiffForWinner: number): number {
    const gd = Math.abs(goalDiff);
    if (gd <= 1) return 1;
    return Math.log(gd + 1) * (2.2 / (Math.abs(eloDiffForWinner) * 0.001 + 2.2));
}

/**
 * Replay `results` (chronological) on top of `seeds` (teamId -> rating).
 * The replay is deliberately damped (weight 0.6) so a handful of early-season
 * games don't swamp the standings-based seed.
 */
export function buildRatings(
    seeds: Map<number, number>,
    results: FinishedResult[],
    homeAdvantage = 65,
): Map<number, number> {
    const table = new Map(seeds);
    const rate = (id: number) => table.get(id) ?? 1500;

    const ordered = [...results].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    for (const r of ordered) {
        const rh = rate(r.homeId);
        const ra = rate(r.awayId);
        const e = expectedScore(rh, ra, homeAdvantage);
        const actual = r.homeGoals > r.awayGoals ? 1 : r.homeGoals === r.awayGoals ? 0.5 : 0;
        const winnerEloDiff = actual === 1 ? rh + homeAdvantage - ra : ra - rh - homeAdvantage;
        const mult = goalMultiplier(r.homeGoals - r.awayGoals, winnerEloDiff);
        const delta = 0.6 * K0 * mult * (actual - e);
        table.set(r.homeId, rh + delta);
        table.set(r.awayId, ra - delta);
    }
    return table;
}

/** Elo-implied 1X2 probabilities. Blended (not used alone) downstream. */
export function eloOutcome(
    homeElo: number,
    awayElo: number,
    homeAdvantage = 65,
): { home: number; draw: number; away: number } {
    const e = expectedScore(homeElo, awayElo, homeAdvantage);
    const evenness = 1 - Math.abs(2 * e - 1);
    const drawProb = Math.max(0.14, 0.3 * evenness ** 1.1);
    let home = e - drawProb / 2;
    let away = 1 - e - drawProb / 2;
    home = Math.max(0.02, home);
    away = Math.max(0.02, away);
    const sum = home + drawProb + away;
    return { home: home / sum, draw: drawProb / sum, away: away / sum };
}
