// services/footballData.ts
// Server-only typed client for Football-Data.org v4.
// Shared rate-limit guard (free tier: 10 requests / minute) lives in KV so it
// holds across serverless invocations. All reads go through the KV cache.

import 'server-only';
import { FOOTBALL_DATA_API_KEY, hasFootballData } from '@/lib/env';
import { cached, store } from '@/lib/kv';
import { log } from '@/lib/log';
import type { HeadToHead, LeagueCode } from '@/types';

const BASE = 'https://api.football-data.org/v4';
const RL_LIMIT = 9; // keep one request of headroom under the 10/min cap

// --- raw fetch with rate-limit guard -----------------------------------

async function acquireSlot(): Promise<void> {
    const minute = Math.floor(Date.now() / 60_000);
    const count = await store.incr(`fd:rl:${minute}`, 90);
    if (count <= RL_LIMIT) return;
    // Wait out the current minute. Callers are sequential, so this can't stack
    // into a long stall; a rare far-over burst still proceeds and 429s (caught).
    if (count > RL_LIMIT + 14) return;
    const waitMs = Math.min(11_000, (minute + 1) * 60_000 - Date.now() + 250);
    log.warn(`football-data rate limit, waiting ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
}

async function fdGet<T>(pathname: string, revalidate = 900): Promise<T> {
    if (!hasFootballData()) throw new Error('FOOTBALL_DATA_API_KEY is not configured');
    await acquireSlot();
    const res = await fetch(`${BASE}${pathname}`, {
        headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
        next: { revalidate },
        signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`football-data ${res.status} on ${pathname}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
}

// --- response shapes (only the fields we use) -------------------------

export interface FDTeam {
    id: number;
    name: string;
    shortName?: string;
    tla?: string;
    crest?: string;
}

export interface FDMatch {
    id: number;
    utcDate: string;
    status: string;
    matchday?: number;
    homeTeam: FDTeam;
    awayTeam: FDTeam;
    competition?: { code?: string };
    score?: {
        fullTime?: { home: number | null; away: number | null };
    };
    venue?: string;
}

interface FDMatchesResponse {
    matches: FDMatch[];
}

export interface FDTableRow {
    position: number;
    team: FDTeam;
    playedGames: number;
    form?: string | null;
    won: number;
    draw: number;
    lost: number;
    points: number;
    goalsFor: number;
    goalsAgainst: number;
}

interface FDStandingsResponse {
    standings: Array<{ type: 'TOTAL' | 'HOME' | 'AWAY'; table: FDTableRow[] }>;
}

export interface StandingsSplit {
    total: FDTableRow[];
    home: FDTableRow[];
    away: FDTableRow[];
}

// --- public API ------------------------------------------------------

const isUpcoming = (s: string) => s === 'SCHEDULED' || s === 'TIMED';

/** Upcoming fixtures for a competition within a date window (inclusive, yyyy-MM-dd). */
export async function getCompetitionMatches(
    code: LeagueCode,
    dateFrom: string,
    dateTo: string,
): Promise<FDMatch[]> {
    return cached(`fd:fixtures:${code}:${dateFrom}:${dateTo}`, 15 * 60, async () => {
        const data = await fdGet<FDMatchesResponse>(
            `/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
            15 * 60,
        );
        return (data.matches ?? []).filter((m) => isUpcoming(m.status));
    });
}

/** Full / home / away league tables for a competition. */
export async function getStandings(code: LeagueCode): Promise<StandingsSplit> {
    return cached(`fd:standings:${code}`, 60 * 60, async () => {
        const data = await fdGet<FDStandingsResponse>(`/competitions/${code}/standings`, 60 * 60);
        const pick = (t: string) => data.standings.find((s) => s.type === t)?.table ?? [];
        return { total: pick('TOTAL'), home: pick('HOME'), away: pick('AWAY') };
    });
}

/** Finished matches this season — used to build Elo ratings. */
export async function getFinishedMatches(code: LeagueCode, season: number): Promise<FDMatch[]> {
    return cached(`fd:finished:${code}:${season}`, 60 * 60, async () => {
        const data = await fdGet<FDMatchesResponse>(
            `/competitions/${code}/matches?status=FINISHED&season=${season}`,
            60 * 60,
        );
        return (data.matches ?? []).filter(
            (m) =>
                m.status === 'FINISHED' &&
                m.score?.fullTime?.home != null &&
                m.score?.fullTime?.away != null,
        );
    });
}

/** Recent head-to-head summary for a fixture. */
export async function getHeadToHead(matchId: number): Promise<HeadToHead | null> {
    try {
        return await cached(`fd:h2h:${matchId}`, 24 * 60 * 60, async () => {
            const data = await fdGet<{
                aggregates?: {
                    numberOfMatches?: number;
                    homeTeam?: { wins: number; draws: number; losses: number };
                    awayTeam?: { wins: number; draws: number; losses: number };
                };
                matches?: FDMatch[];
            }>(`/matches/${matchId}/head2head?limit=10`, 24 * 60 * 60);

            const agg = data.aggregates;
            const played = data.matches ?? [];
            const withGoals = played.filter(
                (m) => m.score?.fullTime?.home != null && m.score?.fullTime?.away != null,
            );
            const totalGoals = withGoals.reduce(
                (s, m) => s + (m.score!.fullTime!.home ?? 0) + (m.score!.fullTime!.away ?? 0),
                0,
            );
            const btts = withGoals.filter(
                (m) => (m.score!.fullTime!.home ?? 0) > 0 && (m.score!.fullTime!.away ?? 0) > 0,
            ).length;

            const n = agg?.numberOfMatches ?? withGoals.length;
            return {
                matches: n,
                homeWins: agg?.homeTeam?.wins ?? 0,
                draws: agg?.homeTeam?.draws ?? 0,
                awayWins: agg?.awayTeam?.wins ?? 0,
                avgGoals: withGoals.length ? totalGoals / withGoals.length : 0,
                bttsRate: withGoals.length ? btts / withGoals.length : 0,
            } satisfies HeadToHead;
        });
    } catch (err) {
        log.warn('h2h fetch failed', (err as Error).message);
        return null;
    }
}

/** Look up finished matches by id (grading). Not cached — used by the cron. */
export async function getMatchesByIds(ids: number[]): Promise<FDMatch[]> {
    if (ids.length === 0) return [];
    const out: FDMatch[] = [];
    // Football-Data caps `ids` at ~50 per call.
    for (let i = 0; i < ids.length; i += 40) {
        const chunk = ids.slice(i, i + 40);
        const data = await fdGet<FDMatchesResponse>(`/matches?ids=${chunk.join(',')}`, 0);
        out.push(...(data.matches ?? []));
    }
    return out;
}
