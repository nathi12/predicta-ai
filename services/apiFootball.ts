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
import {
    API_FOOTBALL_BOOKMAKER_ID,
    API_FOOTBALL_KEY,
    RAPIDAPI_KEY,
    hasApiFootball,
} from '@/lib/env';
import { cached, store } from '@/lib/kv';
import { log } from '@/lib/log';
import type { FixtureOdds, HeadToHead } from '@/types';

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
const PER_MINUTE_LIMIT = 9; // free plan allows ~10/min; keep one of headroom

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

/**
 * Hold under the free plan's per-minute cap. Shared across serverless
 * invocations via KV, like the football-data guard. Waits out the current
 * minute at most once; a far-over burst proceeds and is left to 429 (caught).
 */
async function acquireMinuteSlot(): Promise<void> {
    const minute = Math.floor(Date.now() / 60_000);
    const count = await store.incr(`af:rl:${minute}`, 120);
    if (count <= PER_MINUTE_LIMIT) return;
    if (count > PER_MINUTE_LIMIT + 20) return;
    const waitMs = Math.min(11_000, (minute + 1) * 60_000 - Date.now() + 250);
    log.warn(`api-football per-minute limit, waiting ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
}

export async function budgetRemaining(): Promise<number> {
    const used = (await store.get<number>(`af:calls:${today()}`)) ?? 0;
    return Math.max(0, DAILY_BUDGET - used);
}

async function afGet<T>(pathname: string): Promise<T | null> {
    if (!hasApiFootball()) return null;
    if (!(await spend())) return null;
    await acquireMinuteSlot();
    try {
        const res = await fetch(`${BASE}${pathname}`, {
            headers: AUTH_HEADERS,
            next: { revalidate: 6 * 60 * 60 },
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
            log.warn(`api-football ${res.status} on ${pathname}`);
            return null;
        }
        const json = (await res.json()) as T & { errors?: unknown };
        // API-Football answers plan/param limits with HTTP 200 + a non-empty
        // `errors` and an empty `response`. Treat that as a failed call so
        // callers degrade instead of silently seeing zero results.
        const errs = json?.errors;
        const hasErrors = Array.isArray(errs)
            ? errs.length > 0
            : errs != null && typeof errs === 'object' && Object.keys(errs).length > 0;
        if (hasErrors) {
            log.warn(`api-football ${pathname} → ${JSON.stringify(errs).slice(0, 200)}`);
            return null;
        }
        return json as T;
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
    league?: { id: number };
    teams: { home: { id: number; name: string }; away: { id: number; name: string } };
}

/** A resolved API-Football fixture: its id plus both team ids. */
export interface AFFixtureRef {
    fixtureId: number;
    homeId: number;
    awayId: number;
}

/** API-Football league ids for the competitions we cover — keeps the index small. */
const COVERED_AF_LEAGUE_IDS = new Set([39, 140, 135, 78, 61, 88]);

/**
 * Map of `${normHome}|${normAway}|${yyyy-mm-dd}` -> API-Football fixture id for
 * one calendar day, restricted to the leagues we cover.
 *
 * Uses `/fixtures?date=` with no `season` param: the free plan rejects
 * `league`+`season` fixture queries for the current season ("Free plans do not
 * have access to this season"), but the by-date endpoint works.
 */
export async function getFixturesByDate(date: string): Promise<Record<string, AFFixtureRef>> {
    const key = `af:fixtures:date:v2:${date}`;
    const hit = await store.get<Record<string, AFFixtureRef>>(key);
    if (hit) return hit;

    const data = await afGet<{ response: AFFixture[] }>(`/fixtures?date=${date}`);
    const index: Record<string, AFFixtureRef> = {};
    for (const f of data?.response ?? []) {
        if (f.league?.id && !COVERED_AF_LEAGUE_IDS.has(f.league.id)) continue;
        const day = f.fixture.date.slice(0, 10);
        const k = `${normalizeTeam(f.teams.home.name)}|${normalizeTeam(f.teams.away.name)}|${day}`;
        index[k] = {
            fixtureId: f.fixture.id,
            homeId: f.teams.home.id,
            awayId: f.teams.away.id,
        };
    }
    await store.set(key, index, 6 * 60 * 60);
    return index;
}

/**
 * A team's most recent fixtures (ids + both team ids), newest first. Feeds the
 * corner-rate backfill.
 *
 * NOTE: `?team=&last=` needs a PAID API-Football plan — the free tier rejects the
 * `last` parameter, current-season `team`+`season` queries, and any non-current
 * date. On the free tier afGet returns null here (logged) and the backfill is a
 * no-op; corner history then only accrues from matches the app grades day to day.
 * Cached 12h — a team's recent-match list barely moves.
 */
export async function getTeamRecentFixtures(
    teamId: number,
    last: number,
): Promise<AFFixtureRef[] | null> {
    const key = `af:fixtures:team:v1:${teamId}:${last}`;
    const hit = await store.get<AFFixtureRef[] | { none: true }>(key);
    if (hit) return 'none' in hit ? null : hit;

    const data = await afGet<{ response: AFFixture[] }>(`/fixtures?team=${teamId}&last=${last}`);
    if (!data || !Array.isArray(data.response)) {
        await store.set(key, { none: true }, 6 * 60 * 60);
        return null;
    }
    const out: AFFixtureRef[] = data.response.map((f) => ({
        fixtureId: f.fixture.id,
        homeId: f.teams.home.id,
        awayId: f.teams.away.id,
    }));
    await store.set(key, out, 12 * 60 * 60);
    return out;
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

// --- odds --------------------------------------------------------------
//
// The bet-slip builder prices its selections against real bookmaker odds from
// API-Football's `/odds` endpoint. Pre-match odds only exist for near-term
// fixtures and `/odds` is restricted/low-limit on the free tier, so callers
// fetch sparingly and degrade to fair odds (1 / model probability) on null.

/** API-Football bookmaker id to prefer (e.g. Betway), or 0 for a consensus. */
const PREFERRED_BOOKMAKER_ID = Number(API_FOOTBALL_BOOKMAKER_ID) || 0;

type OddsMarketKey = keyof FixtureOdds['markets'];

interface AFOddsValue {
    value: string;
    odd: string;
}
interface AFOddsBet {
    id: number;
    name: string;
    values: AFOddsValue[];
}
interface AFOddsBookmaker {
    id: number;
    name: string;
    bets: AFOddsBet[];
}
interface AFOddsFixture {
    fixture: { id: number };
    bookmakers: AFOddsBookmaker[];
}

const normOddValue = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Median of a numeric list (undefined for empty). */
function median(xs: number[]): number | undefined {
    if (xs.length === 0) return undefined;
    const s = [...xs].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** How each market we use maps to an API-Football (bet-name-matcher, value-label) pair. */
const ODDS_MAP: Array<{ key: OddsMarketKey; bet: (b: AFOddsBet) => boolean; value: string }> = [
    { key: 'home', bet: (b) => b.id === 1, value: 'home' },
    { key: 'draw', bet: (b) => b.id === 1, value: 'draw' },
    { key: 'away', bet: (b) => b.id === 1, value: 'away' },
    { key: 'over15', bet: (b) => b.id === 5, value: 'over 1.5' },
    { key: 'over25', bet: (b) => b.id === 5, value: 'over 2.5' },
    { key: 'over35', bet: (b) => b.id === 5, value: 'over 3.5' },
    { key: 'btts', bet: (b) => b.id === 8, value: 'yes' },
    { key: 'bttsNo', bet: (b) => b.id === 8, value: 'no' },
    { key: 'dc1x', bet: (b) => b.id === 12, value: 'home/draw' },
    { key: 'dc12', bet: (b) => b.id === 12, value: 'home/away' },
    { key: 'dcx2', bet: (b) => b.id === 12, value: 'draw/away' },
    {
        key: 'corners95',
        bet: (b) => /corner/i.test(b.name) && /over.?\/?.?under/i.test(b.name),
        value: 'over 9.5',
    },
    {
        key: 'corners105',
        bet: (b) => /corner/i.test(b.name) && /over.?\/?.?under/i.test(b.name),
        value: 'over 10.5',
    },
];

function parseBookmaker(bm: AFOddsBookmaker): FixtureOdds['markets'] {
    const out: FixtureOdds['markets'] = {};
    for (const { key, bet, value } of ODDS_MAP) {
        const b = bm.bets.find(bet);
        const v = b?.values.find((x) => normOddValue(x.value) === value);
        const odd = v ? parseFloat(v.odd) : NaN;
        if (Number.isFinite(odd) && odd > 1) out[key] = odd;
    }
    return out;
}

async function fetchFixtureOdds(fixtureId: number): Promise<FixtureOdds | null> {
    const data = await afGet<{ response: AFOddsFixture[] }>(`/odds?fixture=${fixtureId}`);
    const books = data?.response?.[0]?.bookmakers ?? [];
    if (books.length === 0) return null;

    const preferred =
        PREFERRED_BOOKMAKER_ID > 0 ? books.find((b) => b.id === PREFERRED_BOOKMAKER_ID) : undefined;

    if (preferred) {
        const markets = parseBookmaker(preferred);
        if (Object.keys(markets).length > 0) {
            return {
                fixtureId,
                source: 'book',
                bookmaker: preferred.name,
                fetchedAt: new Date().toISOString(),
                markets,
            } satisfies FixtureOdds;
        }
        // Preferred book quoted nothing we use — fall through to consensus.
    }

    // Consensus: median odd per market across every bookmaker that quotes it.
    const parsed = books.map(parseBookmaker);
    const markets: FixtureOdds['markets'] = {};
    for (const { key } of ODDS_MAP) {
        const m = median(parsed.map((p) => p[key]).filter((v): v is number => typeof v === 'number'));
        if (m !== undefined) markets[key] = Math.round(m * 100) / 100;
    }
    if (Object.keys(markets).length === 0) return null;
    return {
        fixtureId,
        source: 'consensus',
        bookmaker: null,
        fetchedAt: new Date().toISOString(),
        markets,
    } satisfies FixtureOdds;
}

/**
 * Pre-match odds for a fixture, distilled to the markets the slip builder uses.
 * Prefers `PREFERRED_BOOKMAKER_ID`; otherwise a per-market median across books.
 * Negative results are cached too — `/odds` calls are the scarcest budget we have.
 */
export async function getFixtureOdds(fixtureId: number): Promise<FixtureOdds | null> {
    const key = `af:odds:${fixtureId}`;
    const hit = await store.get<FixtureOdds | { none: true }>(key);
    if (hit) return 'none' in hit ? null : hit;

    const result = await fetchFixtureOdds(fixtureId);
    // 6h — odds drift but the free plan's 100/day budget won't stretch to
    // refreshing every fixture more often; a stale-ish price still beats none.
    await store.set(key, result ?? { none: true }, 6 * 60 * 60);
    return result;
}

// --- match statistics (corners) -------------------------------------------
//
// football-data.org carries no corner counts, so this is the only feed that can
// grade the corners markets. One `/fixtures/statistics` request per finished
// fixture; the count never changes once a match is over, so results (including
// misses) are cached hard to keep the daily budget intact.

interface AFStatEntry {
    type: string;
    value: number | string | null;
}

// Corners grading is a nice-to-have bolted onto the same free-tier key that
// enrichment and odds depend on. Keep it on its own tight daily sub-budget so a
// backlog can never starve those, no matter how often the cron fires.
const CORNERS_DAILY_CAP = 24;
// The historical backfill (drainCornerBackfill) gets its own smaller sub-budget
// so it can never eat into live grading. Full league coverage takes weeks at
// this pace — fine, the model degrades to the proxy in the meantime and the
// queue is aimed at teams playing soonest.
const CORNERS_BACKFILL_DAILY_CAP = 16;

export async function cornersBudgetRemaining(): Promise<number> {
    const used = (await store.get<number>(`af:corners:calls:${today()}`)) ?? 0;
    return Math.max(0, CORNERS_DAILY_CAP - used);
}

export async function cornersBackfillBudgetRemaining(): Promise<number> {
    const used = (await store.get<number>(`af:corners:backfill:calls:${today()}`)) ?? 0;
    return Math.max(0, CORNERS_BACKFILL_DAILY_CAP - used);
}

export interface FixtureCorners {
    /** Home + away corners. */
    total: number;
    /** Corners keyed by API-Football team id — exactly the two sides. */
    byTeamId: Record<number, number>;
}

/**
 * Per-side corners for a finished fixture, or null if the stats aren't available.
 * `budget` picks which daily sub-budget the request is charged to — live grading
 * and the historical backfill have separate caps so one can't starve the other.
 * The result is cached the same way for both, so a fixture fetched by one path
 * is free for the other.
 */
export async function getFixtureCorners(
    fixtureId: number,
    budget: 'live' | 'backfill' = 'live',
): Promise<FixtureCorners | null> {
    const key = `af:corners:v2:${fixtureId}`;
    const hit = await store.get<FixtureCorners | { none: true }>(key);
    if (hit) return 'none' in hit ? null : hit;

    // Cache miss = a real request. Reserve one against the relevant daily
    // sub-budget and the shared budget both (afGet spends the latter).
    const counterKey =
        budget === 'backfill' ? `af:corners:backfill:calls:${today()}` : `af:corners:calls:${today()}`;
    const cap = budget === 'backfill' ? CORNERS_BACKFILL_DAILY_CAP : CORNERS_DAILY_CAP;
    const cornerCalls = await store.incr(counterKey, 26 * 60 * 60);
    if (cornerCalls > cap) {
        log.warn(`api-football corners ${budget} sub-budget spent for today`);
        return null;
    }

    const data = await afGet<{
        response: Array<{ team?: { id?: number }; statistics: AFStatEntry[] }>;
    }>(`/fixtures/statistics?fixture=${fixtureId}`);

    // A finished match returns one entry per side, each with a Corner Kicks stat.
    // Anything less (stats not collected, match not final, a null value) is
    // treated as missing — note Number(null) is 0, so guard the null explicitly.
    const byTeamId: Record<number, number> = {};
    for (const side of data?.response ?? []) {
        const raw = side.statistics?.find((x) => x.type === 'Corner Kicks')?.value;
        const n = raw == null || raw === '' ? NaN : Number(raw);
        if (side.team?.id && Number.isFinite(n)) byTeamId[side.team.id] = n;
    }

    const ids = Object.keys(byTeamId);
    const result: FixtureCorners | null =
        ids.length === 2
            ? { total: byTeamId[Number(ids[0])] + byTeamId[Number(ids[1])], byTeamId }
            : null;
    // 30d, or a short retry window when the stats aren't up yet.
    await store.set(key, result ?? { none: true }, (result == null ? 6 : 30 * 24) * 60 * 60);
    return result;
}
