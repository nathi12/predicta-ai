// services/apiFootball.ts
// Server-only client for API-Football (RapidAPI). OPTIONAL enrichment layer:
// every function returns null when the key is missing or the daily request
// budget is spent, and callers must degrade gracefully.
//
// Free tier = ~100 requests/day. We spend it on:
//   - one fixture-list call per league per ~6h window
//   - one /predictions call per imminent fixture (cached until kickoff)
// A hard counter in KV stops us before the provider does.

import 'server-only';
import { API_FOOTBALL_KEY, RAPIDAPI_KEY, hasApiFootball } from '@/lib/env';
import { cached, store } from '@/lib/kv';
import { log } from '@/lib/log';
import type { HeadToHead } from '@/types';

// Direct API-Sports access (current season on the free tier) is preferred;
// RapidAPI is the fallback (free plan = seasons 2021-2023 only).
const DIRECT = API_FOOTBALL_KEY.length > 0;
const BASE = DIRECT
    ? 'https://v3.football.api-sports.io'
    : 'https://api-football-v1.p.rapidapi.com/v3';
const AUTH_HEADERS: Record<string, string> = DIRECT
    ? { 'x-apisports-key': API_FOOTBALL_KEY }
    : { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'api-football-v1.p.rapidapi.com' };
const DAILY_BUDGET = 90;

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Reserve one request against today's budget. Returns false when spent. */
async function spend(): Promise<boolean> {
    const n = await store.incr(`af:calls:${today()}`, 26 * 60 * 60);
    if (n > DAILY_BUDGET) {
        log.warn('api-football daily budget exhausted');
        return false;
    }
    return true;
}

export async function budgetRemaining(): Promise<number> {
    const used = (await store.get<number>(`af:calls:${today()}`)) ?? 0;
    return Math.max(0, DAILY_BUDGET - used);
}

async function afGet<T>(pathname: string): Promise<T | null> {
    if (!hasApiFootball()) return null;
    if (!(await spend())) return null;
    try {
        const res = await fetch(`${BASE}${pathname}`, {
            headers: AUTH_HEADERS,
            next: { revalidate: 6 * 60 * 60 },
            signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) {
            log.warn(`api-football ${res.status} on ${pathname}`);
            return null;
        }
        return (await res.json()) as T;
    } catch (err) {
        log.warn('api-football fetch failed', (err as Error).message);
        return null;
    }
}

// --- name matching ---------------------------------------------------

export function normalizeTeam(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\b(fc|cf|afc|sc|ac|as|ssc|rc|cd|ud|club|calcio|1899|1846|1904|1907|09)\b/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

// --- fixtures -------------------------------------------------------

interface AFFixture {
    fixture: { id: number; date: string };
    teams: { home: { name: string }; away: { name: string } };
}

/** Map of `${normHome}|${yyyy-mm-dd}` -> API-Football fixture id for a league window. */
export async function getFixtureIndex(
    leagueId: number,
    season: number,
    from: string,
    to: string,
): Promise<Record<string, number>> {
    const key = `af:fixtures:${leagueId}:${from}:${to}`;
    const hit = await store.get<Record<string, number>>(key);
    if (hit) return hit;

    const data = await afGet<{ response: AFFixture[] }>(
        `/fixtures?league=${leagueId}&season=${season}&from=${from}&to=${to}`,
    );
    const index: Record<string, number> = {};
    for (const f of data?.response ?? []) {
        const day = f.fixture.date.slice(0, 10);
        index[`${normalizeTeam(f.teams.home.name)}|${day}`] = f.fixture.id;
    }
    await store.set(key, index, 6 * 60 * 60);
    return index;
}

// --- predictions ---------------------------------------------------

export interface ApiFootballInsight {
    fixtureId: number;
    /** Provider's own 1X2 probabilities, normalised to sum 1. */
    probs?: { home: number; draw: number; away: number };
    home: SideInsight;
    away: SideInsight;
    h2h?: HeadToHead;
}

export interface SideInsight {
    /** Last-5 goals scored per game. */
    recentFor: number;
    /** Last-5 goals conceded per game. */
    recentAgainst: number;
    /** Attack rating 0-1 (provider "att" percent). */
    att: number;
    /** Defence rating 0-1 (provider "def" percent). */
    def: number;
    /** Points from the last 5 (W=3, D=1). */
    formPoints: number;
}

const pct = (s: string | undefined | null): number => {
    if (!s) return NaN;
    const v = parseFloat(String(s).replace('%', ''));
    return Number.isFinite(v) ? v / 100 : NaN;
};

const num = (s: unknown): number => {
    const v = parseFloat(String(s ?? ''));
    return Number.isFinite(v) ? v : NaN;
};

function formPoints(form: string | undefined): number {
    if (!form) return NaN;
    return form
        .slice(-5)
        .split('')
        .reduce((s, c) => s + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0);
}

export async function getFixtureInsight(fixtureId: number): Promise<ApiFootballInsight | null> {
    return cached(`af:pred:${fixtureId}`, 12 * 60 * 60, async () => {
        const data = await afGet<{ response: unknown[] }>(`/predictions?fixture=${fixtureId}`);
        const r = data?.response?.[0] as
            | {
                  predictions?: { percent?: { home?: string; draw?: string; away?: string } };
                  teams?: {
                      home?: { last_5?: LastFive; league?: { form?: string } };
                      away?: { last_5?: LastFive; league?: { form?: string } };
                  };
                  comparison?: { h2h?: { home?: string; away?: string } };
              }
            | undefined;
        if (!r) return null;

        const ph = pct(r.predictions?.percent?.home);
        const pd = pct(r.predictions?.percent?.draw);
        const pa = pct(r.predictions?.percent?.away);
        const sum = ph + pd + pa;
        const probs =
            Number.isFinite(sum) && sum > 0
                ? { home: ph / sum, draw: pd / sum, away: pa / sum }
                : undefined;

        const side = (s?: { last_5?: LastFive; league?: { form?: string } }): SideInsight => ({
            recentFor: num(s?.last_5?.goals?.for?.average),
            recentAgainst: num(s?.last_5?.goals?.against?.average),
            att: pct(s?.last_5?.att),
            def: pct(s?.last_5?.def),
            formPoints: formPoints(s?.league?.form),
        });

        return {
            fixtureId,
            probs,
            home: side(r.teams?.home),
            away: side(r.teams?.away),
        } satisfies ApiFootballInsight;
    });
}

interface LastFive {
    att?: string;
    def?: string;
    goals?: {
        for?: { average?: string };
        against?: { average?: string };
    };
}
