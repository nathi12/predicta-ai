//services/sportAPI.ts

import axios from 'axios';
import { FootballMatch, FootballTeam } from '@/types';

const RAPID_API_KEY = process.env.NEXT_PUBLIC_RAPID_API_KEY || '';
const FOOTBALL_API_URL = 'https://api-football-v1.p.rapidapi.com/v3';

// Create API client
const footballClient = axios.create({
    baseURL: FOOTBALL_API_URL,
    headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com'
    }
});

// League ID mappings for API-Football
const LEAGUE_IDS: Record<string, number> = {
    'Premier League': 39,
    'La Liga': 140,
    'Serie A': 135,
    'Bundesliga': 78,
    'Ligue 1': 61,
    'UEFA Champions League': 2,
    'Europa League': 3
};

// ============================================
// REQUEST QUEUE FOR RATE LIMITING
// ============================================

class APIRequestQueue {
    private queue: (() => Promise<any>)[] = [];
    private processing = false;
    private requestDelay = 2000; // 2 seconds between requests (safer for rate limits)
    private lastRequestTime = 0;
    private maxRetries = 5; // Increased retries
    private consecutiveRateLimits = 0; // Track rate limit hits

    async add<T>(requestFn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await this.executeWithRetry(requestFn);
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

    private async executeWithRetry<T>(
        fn: () => Promise<T>,
        attempt = 1
    ): Promise<T> {
        try {
            const result = await fn();
            // Reset counter on success
            this.consecutiveRateLimits = 0;
            return result;
        } catch (error: any) {
            if (error.response?.status === 429 && attempt < this.maxRetries) {
                this.consecutiveRateLimits++;

                // Exponential backoff with jitter: 3s, 6s, 12s, 24s, 48s
                const baseWait = Math.pow(2, attempt) * 1500;
                const jitter = Math.random() * 1000; // Add randomness
                const waitTime = baseWait + jitter;

                console.log(`⚠️ Rate limited (${this.consecutiveRateLimits} consecutive). Waiting ${Math.round(waitTime / 1000)}s... (attempt ${attempt}/${this.maxRetries})`);

                // If we're hitting rate limits frequently, increase the base delay
                if (this.consecutiveRateLimits > 3) {
                    this.requestDelay = Math.min(5000, this.requestDelay + 500);
                    console.log(`📊 Increased delay to ${this.requestDelay}ms due to rate limiting`);
                }

                await this.delay(waitTime);
                return this.executeWithRetry(fn, attempt + 1);
            }
            throw error;
        }
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
            await this.delay(this.requestDelay - timeSinceLastRequest);
        }

        this.lastRequestTime = Date.now();

        if (request) {
            await request();
        }

        // Process next request after delay
        setTimeout(() => this.processQueue(), this.requestDelay);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getQueueLength(): number {
        return this.queue.length;
    }
}

// Create global request queue
const apiQueue = new APIRequestQueue();

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Delay helper function
 */
const delay = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

/**
 * Enhanced cache with localStorage persistence
 */
class SimpleCache<T> {
    private cache = new Map<string, { data: T; timestamp: number }>();
    private ttl: number;
    private storageKey = 'predictaai_cache';

    constructor(ttlMinutes: number = 60) {
        this.ttl = ttlMinutes * 60 * 1000;
        this.loadFromStorage();
    }

    private loadFromStorage(): void {
        if (typeof window === 'undefined') return;

        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.cache = new Map(Object.entries(parsed));
            }
        } catch (error) {
            console.warn('Failed to load cache from storage:', error);
        }
    }

    private saveToStorage(): void {
        if (typeof window === 'undefined') return;

        try {
            const obj = Object.fromEntries(this.cache);
            localStorage.setItem(this.storageKey, JSON.stringify(obj));
        } catch (error) {
            console.warn('Failed to save cache to storage:', error);
        }
    }

    get(key: string): T | null {
        const cached = this.cache.get(key);
        if (!cached) return null;

        // Check if expired
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(key);
            this.saveToStorage();
            return null;
        }

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
    }

    size(): number {
        return this.cache.size;
    }
}

// Create cache instance for team statistics (60 minute cache)
const teamStatsCache = new SimpleCache<FootballTeam>(60);

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch upcoming football matches for a specific league
 */
export async function fetchUpcomingFootballMatches(
    league: string,
    season: number = 2025,
    next: number = 10
): Promise<any[]> {
    try {
        const leagueId = LEAGUE_IDS[league] || 39;

        const response = await apiQueue.add(async () => {
            return await footballClient.get('/fixtures', {
                params: {
                    league: leagueId,
                    season: season,
                    next: next
                }
            });
        });

        return response.data.response || [];
    } catch (error) {
        console.error(`Error fetching football matches for ${league}:`, error);
        return [];
    }
}

/**
 * Estimate corners based on team statistics
 * OPTIMIZED: Uses existing stats to estimate corners without additional API calls
 */
function estimateTeamCorners(stats: any): number {
    try {
        const goals = stats.goals || {};
        const fixtures = stats.fixtures || {};

        // Calculate offensive strength indicators
        const goalsFor = goals.for?.total?.total || 0;
        const gamesPlayed = (fixtures.played?.total || 1);
        const goalsPerGame = goalsFor / gamesPlayed;

        // Get form factor (W=3, D=1, L=0 average from last 5)
        const form = stats.form || '';
        let formScore = 0;
        for (const char of form.slice(-5)) {
            if (char === 'W') formScore += 3;
            else if (char === 'D') formScore += 1;
        }
        const formFactor = form.length > 0 ? formScore / (form.slice(-5).length * 3) : 0.5;

        // Estimate corners based on offensive output and form
        // Strong attacking teams: 6-8 corners/game
        // Average teams: 4-6 corners/game  
        // Weak attacking teams: 3-5 corners/game
        let baseCorners: number;

        if (goalsPerGame >= 2.0) {
            baseCorners = 7.5; // Strong attack
        } else if (goalsPerGame >= 1.5) {
            baseCorners = 6.0; // Good attack
        } else if (goalsPerGame >= 1.0) {
            baseCorners = 5.0; // Average attack
        } else {
            baseCorners = 4.0; // Weak attack
        }

        // Adjust based on current form (+/- 1 corner)
        const adjustment = (formFactor - 0.5) * 2; // Range: -1 to +1
        const estimatedCorners = Math.max(3, Math.min(9, baseCorners + adjustment));

        return parseFloat(estimatedCorners.toFixed(1));
    } catch (error) {
        return 5; // Safe default
    }
}

/**
 * Fetch detailed team statistics for football
 * OPTIMIZED: Only makes 1 API call per team, estimates corners from existing data
 */
async function fetchFootballTeamStatistics(
    teamId: number,
    leagueId: number,
    season: number = 2025
): Promise<FootballTeam> {
    // Check cache first
    const cacheKey = `team-${teamId}-${leagueId}-${season}`;
    const cached = teamStatsCache.get(cacheKey);
    if (cached) {
        console.log(`✓ Using cached stats for team ${teamId}`);
        return cached;
    }

    try {
        // Fetch team statistics (SINGLE API CALL)
        const stats = await apiQueue.add(async () => {
            const response = await footballClient.get('/teams/statistics', {
                params: {
                    team: teamId,
                    league: leagueId,
                    season: season
                }
            });
            return response.data.response;
        });

        const fixtures = stats.fixtures || {};
        const goals = stats.goals || {};
        const teamInfo = stats.team || {};

        // OPTIMIZED: Estimate corners from existing stats instead of making 10+ extra API calls
        const cornersPerGame = estimateTeamCorners(stats);

        const teamData: FootballTeam = {
            name: teamInfo.name || 'Unknown Team',
            logo: teamInfo.logo,
            league: stats.league?.name || 'Unknown League',
            form: stats.form || 'N/A',
            goalsScored: goals.for?.total?.total || 0,
            goalsConceded: goals.against?.total?.total || 0,
            wins: fixtures.wins?.total || 0,
            draws: fixtures.draws?.total || 0,
            losses: fixtures.loses?.total || 0,
            averagePossession: parseInt(stats.biggest?.goals?.for?.home || '50'),
            shotsPerGame: parseFloat(stats.biggest?.goals?.for?.away || '10'),
            shotsOnTargetPerGame: parseFloat(stats.biggest?.goals?.for?.away || '5'),
            passAccuracy: 75,
            tacklesPerGame: 15,
            foulsPerGame: parseFloat(stats.cards?.yellow?.['0-15']?.total || '10'),
            cornersPerGame: cornersPerGame // Estimated intelligently from stats
        };

        // Cache the result
        teamStatsCache.set(cacheKey, teamData);
        console.log(`✓ Fetched and cached stats for team ${teamId} - Est. Corners/game: ${cornersPerGame}`);
        return teamData;
    } catch (error) {
        console.error('Error fetching football team statistics:', error);
        throw error;
    }
}

/**
 * Generate default football team stats (fallback)
 */
function generateDefaultFootballTeam(
    name: string,
    league: string,
    logo?: string
): FootballTeam {
    return {
        name,
        logo,
        league,
        form: 'N/A',
        goalsScored: 0,
        goalsConceded: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        averagePossession: 50,
        shotsPerGame: 10,
        shotsOnTargetPerGame: 5,
        passAccuracy: 75,
        tacklesPerGame: 15,
        foulsPerGame: 10,
        cornersPerGame: 5
    };
}

/**
 * Transform API football match data to FootballMatch type
 */
export async function transformFootballMatch(apiMatch: any): Promise<FootballMatch> {
    const leagueId = apiMatch.league?.id;

    let homeTeam: FootballTeam;
    let awayTeam: FootballTeam;

    try {
        // Fetch both teams (queue will handle rate limiting)
        // OPTIMIZED: Now only 2 API calls per match instead of 14+
        homeTeam = await fetchFootballTeamStatistics(
            apiMatch.teams.home.id,
            leagueId
        );

        awayTeam = await fetchFootballTeamStatistics(
            apiMatch.teams.away.id,
            leagueId
        );
    } catch (error) {
        // Fallback to default stats if API fails
        console.warn('Failed to fetch team statistics, using defaults');
        homeTeam = generateDefaultFootballTeam(
            apiMatch.teams.home.name,
            apiMatch.league.name,
            apiMatch.teams.home.logo
        );
        awayTeam = generateDefaultFootballTeam(
            apiMatch.teams.away.name,
            apiMatch.league.name,
            apiMatch.teams.away.logo
        );
    }

    return {
        id: apiMatch.fixture.id,
        sport: 'football',
        league: apiMatch.league.name,
        homeTeam,
        awayTeam,
        date: new Date(apiMatch.fixture.date).toISOString().split('T')[0],
        venue: apiMatch.fixture.venue?.name
    };
}

/**
 * Fetch all upcoming football matches
 */
export async function fetchAllUpcomingMatches(): Promise<{
    footballMatches: FootballMatch[];
}> {
    try {
        console.log('🔄 Starting match fetch process...');

        // Fetch football matches from multiple leagues sequentially
        const leagues = [
            'Premier League',
            'La Liga',
            'Serie A',
            'Bundesliga'
        ];

        const allMatches: any[] = [];

        // Fetch leagues one at a time
        for (const league of leagues) {
            console.log(`📊 Fetching matches for ${league}...`);
            const matches = await fetchUpcomingFootballMatches(league, 2025, 5);
            allMatches.push(...matches);
            console.log(`✓ Found ${matches.length} matches for ${league}`);
        }

        console.log(`📈 Total matches to process: ${allMatches.length}`);
        console.log(`⏳ Estimated time: ~${Math.ceil(allMatches.length * 4 / 60)} minutes (2s delay per API call)`);
        console.log(`⚡ OPTIMIZED: Only 2 API calls per match (down from 14+)`);

        // Transform all matches (queue handles rate limiting automatically)
        const footballMatches = await Promise.all(
            allMatches.map(match => transformFootballMatch(match))
        );

        console.log(`✅ Successfully processed ${footballMatches.length} matches`);
        console.log(`💾 Cache size: ${teamStatsCache.size()} teams cached`);

        return {
            footballMatches
        };
    } catch (error) {
        console.error('❌ Error fetching all upcoming matches:', error);
        return {
            footballMatches: []
        };
    }
}

/**
 * Clear the team statistics cache (useful for manual refresh)
 */
export function clearTeamStatsCache(): void {
    teamStatsCache.clear();
    console.log('🗑️ Team statistics cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
    size: number;
    queueLength: number;
} {
    return {
        size: teamStatsCache.size(),
        queueLength: apiQueue.getQueueLength()
    };
}