// lib/env.ts
// Server-only environment access. Never import this into a Client Component.

import 'server-only';

function read(...names: string[]): string {
    for (const name of names) {
        const value = process.env[name];
        if (value && value.trim()) return value.trim();
    }
    return '';
}

/** Football-Data.org v4 API token. */
export const FOOTBALL_DATA_API_KEY = read(
    'FOOTBALL_DATA_API_KEY',
    'NEXT_PUBLIC_FOOTBALL_DATA_KEY', // legacy name — rotate & rename
);

/** RapidAPI key for API-Football. Optional — enrichment is skipped when absent. */
export const RAPIDAPI_KEY = read('RAPIDAPI_KEY', 'NEXT_PUBLIC_RAPID_API_KEY');

/**
 * Direct API-Sports key (dashboard.api-football.com). Preferred over RapidAPI:
 * the RapidAPI free plan only exposes seasons 2021-2023, whereas the direct
 * free tier allows the current season at 100 req/day.
 */
export const API_FOOTBALL_KEY = read('API_FOOTBALL_KEY', 'API_SPORTS_KEY');

/**
 * Optional API-Football bookmaker id (from `GET /odds/bookmakers`) that the
 * bet-slip builder should price against — e.g. Betway. Unset ⇒ the builder uses
 * a consensus (median across books). Live odds require a direct
 * `API_FOOTBALL_KEY`; the RapidAPI free plan has no current-season odds.
 */
export const API_FOOTBALL_BOOKMAKER_ID = read('API_FOOTBALL_BOOKMAKER_ID');

/** Shared secret required to trigger the grading cron route. */
export const CRON_SECRET = read('CRON_SECRET');

/** Upstash / Vercel KV REST credentials (optional in dev). */
export const KV_REST_API_URL = read('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
export const KV_REST_API_TOKEN = read('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');

export const hasFootballData = () => FOOTBALL_DATA_API_KEY.length > 0;
export const hasApiFootball = () => API_FOOTBALL_KEY.length > 0 || RAPIDAPI_KEY.length > 0;
export const hasKV = () => KV_REST_API_URL.length > 0 && KV_REST_API_TOKEN.length > 0;
