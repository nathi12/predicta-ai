// lib/oddsData.ts
// Fetches bookmaker odds for the near-term fixtures the bet-slip builder can use,
// keyed by EnrichedMatch.id. One KV-cached entry point: getUpcomingOdds().
//
// Kept separate from lib/matchData.ts so the busy homepage build never pays the
// odds cost, and so a spent API budget degrades the slip builder (to fair odds)
// without touching predictions.

import 'server-only';
import { after } from 'next/server';
import { store } from '@/lib/kv';
import { log } from '@/lib/log';
import { getUpcomingMatches } from '@/lib/matchData';
import { getFixtureOdds } from '@/services/apiFootball';
import type { FixtureOdds } from '@/types';

export type OddsMap = Record<string, FixtureOdds>;

const CACHE_KEY = 'odds:v1';
const STALE_KEY = 'odds:v1:stale';
// The per-fixture af:odds:* entries live 6h; this aggregate refreshes more often
// so newly-priced fixtures appear, but most rebuilds are all cache hits.
const TTL = 90 * 60;
const EMPTY_TTL = 20 * 60;
const STALE_TTL = 36 * 60 * 60;
const HOURS_AHEAD = 96;
const MAX_PER_BUILD = 10;

const globalForFlight = globalThis as unknown as { __predictaOdds?: Promise<OddsMap> };

/**
 * Odds keyed by match id. Never blocks the slip page: returns whatever is cached
 * (fresh, then stale, then `{}`) immediately and rebuilds detached. The builder
 * falls back to fair odds for any fixture without an entry.
 */
export async function getUpcomingOdds(): Promise<OddsMap> {
    const fresh = await store.get<OddsMap>(CACHE_KEY);
    if (fresh) return fresh;

    const rebuild = ensureBuild();
    keepAlive(rebuild);

    return (await store.get<OddsMap>(STALE_KEY)) ?? {};
}

function ensureBuild(): Promise<OddsMap> {
    if (!globalForFlight.__predictaOdds) {
        globalForFlight.__predictaOdds = (async () => {
            try {
                const built = await build();
                const n = Object.keys(built).length;
                await store.set(CACHE_KEY, built, n > 0 ? TTL : EMPTY_TTL);
                if (n > 0) await store.set(STALE_KEY, built, STALE_TTL);
                return n > 0 ? built : ((await store.get<OddsMap>(STALE_KEY)) ?? {});
            } catch (err) {
                log.warn('odds build failed', (err as Error).message);
                return (await store.get<OddsMap>(STALE_KEY)) ?? {};
            } finally {
                globalForFlight.__predictaOdds = undefined;
            }
        })();
    }
    return globalForFlight.__predictaOdds;
}

function keepAlive(p: Promise<unknown>): void {
    try {
        after(() => p.catch(() => {}));
    } catch {
        p.catch(() => {});
    }
}

/** Rebuild the odds cache ahead of traffic if stale (called by the daily cron). */
export async function warmUpcomingOdds(): Promise<number> {
    const fresh = await store.get<OddsMap>(CACHE_KEY);
    if (fresh && Object.keys(fresh).length > 0) return Object.keys(fresh).length;
    return Object.keys(await ensureBuild()).length;
}

async function build(): Promise<OddsMap> {
    const matches = await getUpcomingMatches();
    const now = Date.now();

    const targets = matches
        .filter((m) => {
            if (!m.match.apiFootballFixtureId) return false;
            const h = (new Date(m.match.kickoff).getTime() - now) / 3_600_000;
            return h > 0 && h <= HOURS_AHEAD;
        })
        .sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff))
        .slice(0, MAX_PER_BUILD);

    const out: OddsMap = {};
    for (const m of targets) {
        const odds = await getFixtureOdds(m.match.apiFootballFixtureId as number);
        if (odds && Object.keys(odds.markets).length > 0) out[m.match.id] = odds;
    }
    return out;
}
