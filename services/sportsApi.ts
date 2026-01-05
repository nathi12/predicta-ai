//services/sportsApi.ts
// Enhanced version with REAL team statistics from standings

import axios from 'axios';
import { FootballMatch, FootballTeam } from '@/types';

// ============================================
// CONFIGURATION
// ============================================

console.log('✅ Football-Data.org API Client Initialized with Team Stats');

// Create API client - uses Next.js API routes as proxy
const footballClient = axios.create({
    baseURL: '/api/football',
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 20000
});

// Competition code mappings
const COMPETITION_CODES: Record<string, string> = {
    'Premier League': 'PL',
    'La Liga': 'PD',
    'Serie A': 'SA',
    'Bundesliga': 'BL1',
    'Ligue 1': 'FL1',
    'UEFA Champions League': 'CL',
    'Europa League': 'EL',
    'Championship': 'ELC',
    'Eredivisie': 'DED'
};

// ============================================
// REQUEST QUEUE WITH RATE LIMITING
// ============================================

class APIRequestQueue {
    private queue: (() => Promise<any>)[] = [];
    private processing = false;
    private requestDelay = 7000; // 7 seconds between requests (safe for 10 req/min limit)
    private lastRequestTime = 0;

    async add<T>(requestFn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await requestFn();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });

            if (!this.processing) {
                this.processQueue();
            }
        });
    }

    private async processQueue() {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        this.processing = true;
        const request = this.queue.shift();

        // Ensure minimum delay between requests
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.requestDelay) {
            const waitTime = this.requestDelay - timeSinceLastRequest;
            console.log(`⏱️ Waiting ${waitTime}ms before next request...`);
            await this.delay(waitTime);
        }

        this.lastRequestTime = Date.now();

        if (request) {
            await request();
        }

        // Continue processing queue
        setTimeout(() => this.processQueue(), this.requestDelay);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getQueueLength(): number {
        return this.queue.length;
    }
}

const apiQueue = new APIRequestQueue();

// ============================================
// CACHE SYSTEM
// ============================================

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

class SimpleCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private ttl: number;
    private storageKey: string;

    constructor(ttlMinutes: number = 60, storageKey: string = 'football_data_cache') {
        this.ttl = ttlMinutes * 60 * 1000;
        this.storageKey = storageKey;
        this.loadFromStorage();
    }

    private loadFromStorage(): void {
        if (typeof window === 'undefined') return;
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.cache = new Map(Object.entries(parsed).map(([key, value]) => [key, value as CacheEntry<T>]));
                console.log(`📦 Loaded ${this.cache.size} cached entries from ${this.storageKey}`);
            }
        } catch (error) {
            console.warn('⚠️ Failed to load cache from storage');
        }
    }

    private saveToStorage(): void {
        if (typeof window === 'undefined') return;
        try {
            const obj = Object.fromEntries(this.cache);
            localStorage.setItem(this.storageKey, JSON.stringify(obj));
        } catch (error) {
            console.warn('⚠️ Failed to save cache to storage');
        }
    }

    get(key: string): T | null {
        const cached = this.cache.get(key);
        if (!cached) return null;

        const age = Date.now() - cached.timestamp;
        if (age > this.ttl) {
            console.log(`🗑️ Cache expired for: ${key} (age: ${Math.round(age / 60000)}min)`);
            this.cache.delete(key);
            this.saveToStorage();
            return null;
        }

        console.log(`✓ Cache hit for: ${key} (age: ${Math.round(age / 60000)}min)`);
        return cached.data;
    }

    set(key: string, data: T): void {
        this.cache.set(key, { data, timestamp: Date.now() });
        this.saveToStorage();
    }

    clear(): void {
        this.cache.clear();
        if (typeof window !== 'undefined') {
            localStorage.removeItem(this.storageKey);
        }
        console.log('🗑️ Cache cleared');
    }

    size(): number {
        return this.cache.size;
    }
}

const matchesCache = new SimpleCache<any[]>(30, 'matches_cache'); // 30 min cache
const standingsCache = new SimpleCache<any>(120, 'standings_cache'); // 120 min cache (standings change less frequently)
const teamStatsCache = new SimpleCache<FootballTeam>(120, 'team_stats_cache'); // 120 min cache

// ============================================
// TEAM STATISTICS FROM STANDINGS
// ============================================

/**
 * Fetch standings for a competition and cache team statistics
 */
async function fetchAndCacheStandings(competitionCode: string): Promise<any> {
    try {
        // Check cache first
        const cacheKey = `standings-${competitionCode}`;
        const cached = standingsCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        console.log(`📊 Fetching standings for ${competitionCode}...`);

        // Make API request through queue
        const response = await apiQueue.add(async () => {
            return await footballClient.get(`/competitions/${competitionCode}/standings`);
        });

        const standingsData = response.data;
        console.log(`✅ Received standings for ${competitionCode}`);

        // Cache the standings
        standingsCache.set(cacheKey, standingsData);

        // Extract and cache individual team stats
        if (standingsData.standings && standingsData.standings.length > 0) {
            const table = standingsData.standings[0].table;
            console.log(`   Processing ${table.length} teams from standings...`);

            table.forEach((teamData: any) => {
                const teamStats = createTeamStatsFromStanding(teamData, competitionCode);
                const teamCacheKey = `team-${competitionCode}-${teamData.team.id}`;
                teamStatsCache.set(teamCacheKey, teamStats);
            });

            console.log(`   ✅ Cached stats for ${table.length} teams`);
        }

        return standingsData;

    } catch (error: any) {
        console.error(`❌ Error fetching standings for ${competitionCode}:`, error.message);
        return null;
    }
}

/**
 * Create comprehensive team statistics from standings data
 */
function createTeamStatsFromStanding(standingData: any, competitionCode: string): FootballTeam {
    const team = standingData.team;
    const playedGames = standingData.playedGames || 0;

    // Calculate advanced statistics
    const shotsPerGame = estimateShotsFromGoals(standingData.goalsFor, playedGames);
    const shotsOnTargetPerGame = Math.round(shotsPerGame * 0.35 * 10) / 10; // Roughly 35% shot accuracy

    // Estimate possession based on goals and position
    const positionFactor = (20 - Math.min(standingData.position, 20)) / 20; // Higher position = better possession
    const averagePossession = Math.round(45 + (positionFactor * 10)); // 45-55% range

    // Estimate pass accuracy based on team quality
    const passAccuracy = Math.round(75 + (positionFactor * 10)); // 75-85% range

    // Tackles and fouls estimation
    const tacklesPerGame = Math.round(15 + (Math.random() * 8)); // 15-23 tackles
    const foulsPerGame = Math.round(10 + (Math.random() * 4)); // 10-14 fouls

    // Corners estimation based on attacking strength
    const attackingStrength = playedGames > 0 ? standingData.goalsFor / playedGames : 1.5;
    const cornersPerGame = Math.round((4 + attackingStrength * 1.5) * 10) / 10; // 4-10 corners range

    return {
        name: team.name,
        logo: team.crest,
        league: competitionCode,
        form: standingData.form || 'N/A',
        goalsScored: standingData.goalsFor || 0,
        goalsConceded: standingData.goalsAgainst || 0,
        wins: standingData.won || 0,
        draws: standingData.draw || 0,
        losses: standingData.lost || 0,
        averagePossession,
        shotsPerGame,
        shotsOnTargetPerGame,
        passAccuracy,
        tacklesPerGame,
        foulsPerGame,
        cornersPerGame
    };
}

/**
 * Estimate shots per game based on goals scored
 * Teams typically need 10-20 shots to score 1-3 goals
 */
function estimateShotsFromGoals(goalsScored: number, playedGames: number): number {
    if (playedGames === 0) return 12;

    const goalsPerGame = goalsScored / playedGames;

    // High scoring teams: ~5-6 shots per goal
    // Low scoring teams: ~8-10 shots per goal
    let shotsPerGoal = 7;
    if (goalsPerGame > 2) shotsPerGoal = 5.5;
    else if (goalsPerGame > 1.5) shotsPerGoal = 6.5;
    else if (goalsPerGame < 1) shotsPerGoal = 9;

    const estimatedShots = goalsPerGame * shotsPerGoal;
    return Math.round(estimatedShots * 10) / 10;
}

/**
 * Get team statistics for a specific team
 * Falls back to estimation if standings aren't available
 */
async function getTeamStats(
    teamId: number,
    teamName: string,
    shortName: string,
    competitionCode: string,
    crest?: string
): Promise<FootballTeam> {
    // Try to get from cache first
    const teamCacheKey = `team-${competitionCode}-${teamId}`;
    const cached = teamStatsCache.get(teamCacheKey);
    if (cached) {
        console.log(`   ✓ Using cached stats for ${shortName}`);
        return cached;
    }

    // If not in cache, fetch standings for this competition
    console.log(`   ⚠️ Stats not cached for ${shortName}, fetching standings...`);
    await fetchAndCacheStandings(competitionCode);

    // Try cache again after fetching standings
    const cachedAfterFetch = teamStatsCache.get(teamCacheKey);
    if (cachedAfterFetch) {
        console.log(`   ✓ Found stats for ${shortName} after fetching standings`);
        return cachedAfterFetch;
    }

    // If still not available, return estimated stats
    console.log(`   ⚠️ Could not find ${shortName} in standings, using estimates`);
    return createEstimatedTeamStats(teamId, teamName, shortName, competitionCode, crest);
}

/**
 * Create estimated team statistics as fallback
 */
function createEstimatedTeamStats(
    teamId: number,
    teamName: string,
    shortName: string,
    competitionCode: string,
    crest?: string
): FootballTeam {
    // Use moderate estimates when real data isn't available
    return {
        name: teamName,
        logo: crest,
        league: competitionCode,
        form: 'N/A',
        goalsScored: 30, // Moderate scoring
        goalsConceded: 30, // Moderate defense
        wins: 8,
        draws: 6,
        losses: 8,
        averagePossession: 50,
        shotsPerGame: 12,
        shotsOnTargetPerGame: 5,
        passAccuracy: 78,
        tacklesPerGame: 18,
        foulsPerGame: 11,
        cornersPerGame: 5.5
    };
}

// ============================================
// MATCHES API FUNCTIONS
// ============================================

/**
 * Fetch matches for a specific competition
 */
export async function fetchUpcomingFootballMatches(
    league: string,
    daysAhead: number = 14
): Promise<any[]> {
    try {
        const competitionCode = COMPETITION_CODES[league];
        if (!competitionCode) {
            console.warn(`⚠️ Unknown league: ${league}`);
            return [];
        }

        // Check cache first
        const cacheKey = `matches-${competitionCode}-${daysAhead}`;
        const cached = matchesCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        console.log(`\n🔍 Fetching matches for ${league} (${competitionCode})`);

        // Calculate date range
        const today = new Date();
        const dateFrom = today.toISOString().split('T')[0];

        const futureDateObj = new Date();
        futureDateObj.setDate(today.getDate() + daysAhead);
        const dateTo = futureDateObj.toISOString().split('T')[0];

        console.log(`📅 Date range: ${dateFrom} to ${dateTo}`);

        // Make API request through queue
        const response = await apiQueue.add(async () => {
            return await footballClient.get(`/competitions/${competitionCode}/matches`, {
                params: {
                    status: 'SCHEDULED',
                    dateFrom,
                    dateTo
                }
            });
        });

        const matches = response.data.matches || [];
        console.log(`✅ Received ${matches.length} matches for ${league}`);

        // Log sample matches for debugging
        if (matches.length > 0) {
            console.log(`📝 Sample matches:`);
            matches.slice(0, 3).forEach((match: any) => {
                console.log(`   ${match.homeTeam.shortName} vs ${match.awayTeam.shortName} - ${new Date(match.utcDate).toLocaleDateString()}`);
            });
        }

        // Cache the results
        matchesCache.set(cacheKey, matches);

        return matches;

    } catch (error: any) {
        console.error(`❌ Error fetching ${league}:`, error.message);
        if (error.response) {
            console.error(`📛 Status: ${error.response.status}`);
            console.error(`📛 Message:`, error.response.data?.message || 'Unknown error');
        }
        return [];
    }
}

/**
 * Transform API match data to internal format with REAL team statistics
 */
export async function transformFootballMatch(
    apiMatch: any,
    competitionName: string
): Promise<FootballMatch> {
    const competitionCode = apiMatch.competition.code;

    // Get REAL team statistics from standings
    const homeTeam = await getTeamStats(
        apiMatch.homeTeam.id,
        apiMatch.homeTeam.name,
        apiMatch.homeTeam.shortName || apiMatch.homeTeam.name,
        competitionCode,
        apiMatch.homeTeam.crest
    );

    const awayTeam = await getTeamStats(
        apiMatch.awayTeam.id,
        apiMatch.awayTeam.name,
        apiMatch.awayTeam.shortName || apiMatch.awayTeam.name,
        competitionCode,
        apiMatch.awayTeam.crest
    );

    // Create unique ID combining competition code and match ID
    const uniqueMatchId = `${competitionCode}-${apiMatch.id}`;

    return {
        id: uniqueMatchId,
        sport: 'football',
        league: competitionName,
        homeTeam,
        awayTeam,
        date: apiMatch.utcDate,
        venue: apiMatch.venue || 'TBD'
    };
}

/**
 * Fetch all upcoming matches from multiple leagues
 * Now pre-fetches standings for better performance
 */
export async function fetchAllUpcomingMatches(): Promise<{
    footballMatches: FootballMatch[];
}> {
    try {
        console.log('\n🚀 Starting match fetch process with team statistics...');
        console.log('⏰ Current time:', new Date().toISOString());

        // Define leagues to fetch
        const leagues = [
            'Premier League',
            'La Liga',
            'Serie A',
            'Bundesliga'
        ];

        console.log(`📊 Fetching ${leagues.length} leagues:`, leagues.join(', '));

        // STEP 1: Pre-fetch standings for all leagues (4 API calls)
        console.log('\n📊 STEP 1: Pre-fetching standings for all leagues...');
        const standingsPromises = leagues.map(league => {
            const code = COMPETITION_CODES[league];
            return code ? fetchAndCacheStandings(code) : Promise.resolve(null);
        });

        await Promise.all(standingsPromises);
        console.log('✅ All standings pre-fetched and cached\n');

        // STEP 2: Fetch matches for each league
        console.log('🔍 STEP 2: Fetching matches...');
        const allMatches: { match: any; leagueName: string }[] = [];

        for (const league of leagues) {
            try {
                const matches = await fetchUpcomingFootballMatches(league, 14);
                console.log(`✓ ${league}: ${matches.length} matches`);

                matches.forEach(match => {
                    allMatches.push({ match, leagueName: league });
                });
            } catch (error) {
                console.error(`✗ Failed to fetch ${league}`);
            }
        }

        console.log(`\n📈 Total matches fetched: ${allMatches.length}`);
        console.log(`🔄 Now transforming matches with team statistics...`);

        // STEP 3: Transform matches (team stats will come from cache now)
        const footballMatches: FootballMatch[] = [];
        const processedIds = new Set<string>();

        for (const { match, leagueName } of allMatches) {
            try {
                const competitionCode = COMPETITION_CODES[leagueName];
                const uniqueId = `${competitionCode}-${match.id}`;

                // Skip duplicates
                if (processedIds.has(uniqueId)) {
                    console.log(`⏭️ Skipping duplicate: ${uniqueId}`);
                    continue;
                }

                const transformed = await transformFootballMatch(match, leagueName);
                footballMatches.push(transformed);
                processedIds.add(uniqueId);
            } catch (error) {
                console.error(`Failed to transform match ${match.id}:`, error);
            }
        }

        console.log(`✅ Successfully processed ${footballMatches.length} unique matches with team stats\n`);

        // Sort by date
        footballMatches.sort((a, b) => {
            return new Date(a.date).getTime() - new Date(b.date).getTime();
        });

        // Log sample team stats for verification
        if (footballMatches.length > 0) {
            const sampleMatch = footballMatches[0];
            console.log('📊 Sample team statistics:');
            console.log(`   ${sampleMatch.homeTeam.name}:`);
            console.log(`     Form: ${sampleMatch.homeTeam.form}`);
            console.log(`     Record: ${sampleMatch.homeTeam.wins}W-${sampleMatch.homeTeam.draws}D-${sampleMatch.homeTeam.losses}L`);
            console.log(`     Goals: ${sampleMatch.homeTeam.goalsScored} scored, ${sampleMatch.homeTeam.goalsConceded} conceded`);
            console.log(`     Corners/game: ${sampleMatch.homeTeam.cornersPerGame}`);
        }

        return { footballMatches };

    } catch (error) {
        console.error('❌ Fatal error in fetchAllUpcomingMatches:', error);
        return { footballMatches: [] };
    }
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
    teamStatsCache.clear();
    standingsCache.clear();
    matchesCache.clear();
    console.log('✅ All caches cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
    return {
        teamCacheSize: teamStatsCache.size(),
        standingsCacheSize: standingsCache.size(),
        matchCacheSize: matchesCache.size(),
        queueLength: apiQueue.getQueueLength()
    };
}