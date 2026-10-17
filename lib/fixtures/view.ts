// lib/fixtures/view.ts
// Pure view logic for the fixtures list and match page: probability bands,
// time-zone-aware day grouping, filtering and sorting. No React, no I/O.

import type { FixtureSummary } from './summary';

// ---------------------------------------------------------------------------
// Probability bands
// ---------------------------------------------------------------------------

export type ProbBand = 1 | 2 | 3 | 4;

/** Legend rows, low to high. Bands follow the rounded percentage the reader sees. */
export const PROB_BANDS: { band: ProbBand; label: string }[] = [
    { band: 1, label: '<35' },
    { band: 2, label: '35–50' },
    { band: 3, label: '50–65' },
    { band: 4, label: '65+' },
];

export const pct = (p: number): string => `${Math.round(p * 100)}%`;

export function probBand(p: number): ProbBand {
    const shown = Math.round(p * 100);
    if (shown >= 65) return 4;
    if (shown >= 50) return 3;
    if (shown >= 35) return 2;
    return 1;
}

/** The most likely 1X2 outcome (home wins a tie, then draw). */
export function favouriteOutcome(o: { home: number; draw: number; away: number }): 'home' | 'draw' | 'away' {
    if (o.home >= o.draw && o.home >= o.away) return 'home';
    return o.draw >= o.away ? 'draw' : 'away';
}

export type ConfidenceLabel = 'High' | 'Medium' | 'Low';

export function confidenceBand(value: number): { level: 1 | 2 | 3; label: ConfidenceLabel } {
    if (value >= 70) return { level: 3, label: 'High' };
    if (value >= 50) return { level: 2, label: 'Medium' };
    return { level: 1, label: 'Low' };
}

// ---------------------------------------------------------------------------
// Days and time zones
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(tz: string): Intl.DateTimeFormat {
    let f = dayFormatters.get(tz);
    if (!f) {
        f = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        dayFormatters.set(tz, f);
    }
    return f;
}

/** Calendar day of an instant in a time zone, as `YYYY-MM-DD`. */
export function dayKey(at: string | Date, tz: string): string {
    const parts = dayFormatter(tz).formatToParts(typeof at === 'string' ? new Date(at) : at);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

const keyToUtc = (key: string): number => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};

/** Whole calendar days from `todayKey` to the kickoff's day in `tz` (0 = today). */
export function dayOffset(kickoff: string, tz: string, todayKey: string): number {
    return Math.round((keyToUtc(dayKey(kickoff, tz)) - keyToUtc(todayKey)) / DAY_MS);
}

/** Heading for a day group: "Today", "Tomorrow" (once today is known) + the date. */
export function dayLabel(key: string, todayKey: string | null): { relative: string | null; date: string } {
    const date = new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    }).format(new Date(keyToUtc(key)));
    if (!todayKey) return { relative: null, date };
    const diff = Math.round((keyToUtc(key) - keyToUtc(todayKey)) / DAY_MS);
    return { relative: diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : null, date };
}

export type KickoffFormat = 'full' | 'time' | 'dayTime';

const KICKOFF_OPTIONS: Record<KickoffFormat, Intl.DateTimeFormatOptions> = {
    full: { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
    time: { hour: '2-digit', minute: '2-digit' },
    dayTime: { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
};

/**
 * Kickoff label. `locale` undefined means the viewer's locale — only pass that
 * after hydration; the server render uses a fixed locale so markup matches.
 */
export function formatKickoff(
    iso: string,
    format: KickoffFormat,
    tz: string,
    locale: string | undefined,
): string {
    return new Intl.DateTimeFormat(locale, {
        ...KICKOFF_OPTIONS[format],
        timeZone: tz,
        ...(locale ? { hour12: false } : {}),
    }).format(new Date(iso));
}

/** Consecutive fixtures that share a calendar day in `tz`; input order is kept. */
export function groupByDay<T extends { kickoff: string }>(
    rows: T[],
    tz: string,
): { key: string; rows: T[] }[] {
    const groups: { key: string; rows: T[] }[] = [];
    for (const row of rows) {
        const key = dayKey(row.kickoff, tz);
        const last = groups[groups.length - 1];
        if (last && last.key === key) last.rows.push(row);
        else groups.push({ key, rows: [row] });
    }
    return groups;
}

// ---------------------------------------------------------------------------
// Filters and sorting
// ---------------------------------------------------------------------------

export type DateBucket = 'all' | 'today' | 'tomorrow' | '3d' | 'week';
export type SortKey =
    | 'kickoff'
    | 'confidence'
    | 'over15'
    | 'over25'
    | 'over35'
    | 'btts'
    | 'corners95'
    | 'corners105';

export interface Filters {
    league: string;
    date: DateBucket;
    sort: SortKey;
    /** Show only fixtures enriched with API-Football live form + provider signals. */
    enrichedOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
    league: 'all',
    date: 'all',
    sort: 'kickoff',
    enrichedOnly: false,
};

export const isDefaultFilters = (f: Filters): boolean =>
    f.league === DEFAULT_FILTERS.league &&
    f.date === DEFAULT_FILTERS.date &&
    f.sort === DEFAULT_FILTERS.sort &&
    f.enrichedOnly === DEFAULT_FILTERS.enrichedOnly;

export const MARKET_LABEL: Record<SortKey, string> = {
    kickoff: 'Kick-off',
    confidence: 'Confidence',
    over15: 'Over 1.5 goals',
    over25: 'Over 2.5 goals',
    over35: 'Over 3.5 goals',
    btts: 'Both teams score',
    corners95: 'Over 9.5 corners',
    corners105: 'Over 10.5 corners',
};

/** Compact column heading for a market. */
export const MARKET_SHORT: Record<SortKey, string> = {
    kickoff: 'Kick-off',
    confidence: 'Conf',
    over15: 'O1.5',
    over25: 'O2.5',
    over35: 'O3.5',
    btts: 'BTTS',
    corners95: 'C9.5',
    corners105: 'C10.5',
};

/** Every sort except kick-off ranks fixtures 1..N. */
export const isRanked = (sort: SortKey): boolean => sort !== 'kickoff';

/**
 * Where a ranked sort shows up in a row: an existing column, or the extra
 * "ranked market" column for markets the row doesn't otherwise show.
 */
export function focusColumn(sort: SortKey): 'o25' | 'btts' | 'conf' | 'extra' | null {
    switch (sort) {
        case 'kickoff':
            return null;
        case 'over25':
            return 'o25';
        case 'btts':
            return 'btts';
        case 'confidence':
            return 'conf';
        default:
            return 'extra';
    }
}

/** The probability a market sort ranks by; null for kick-off, confidence or an unmodelled line. */
export function marketProbability(f: FixtureSummary, sort: SortKey): number | null {
    switch (sort) {
        case 'over15':
            return f.markets.over15;
        case 'over25':
            return f.markets.over25;
        case 'over35':
            return f.markets.over35;
        case 'btts':
            return f.markets.btts;
        case 'corners95':
            return f.markets.corners95;
        case 'corners105':
            return f.markets.corners105;
        default:
            return null;
    }
}

function sortValue(f: FixtureSummary, sort: SortKey): number {
    if (sort === 'confidence') return f.confidence;
    return marketProbability(f, sort) ?? -1;
}

/**
 * Whether a kickoff falls in a date bucket. Before the viewer's day is known
 * (`offset` null — server render and hydration) every bucket passes; the
 * default bucket is 'all', so that only matters for a mid-hydration change.
 */
export function inBucket(offset: number | null, bucket: DateBucket): boolean {
    if (bucket === 'all' || offset == null) return true;
    switch (bucket) {
        case 'today':
            return offset === 0;
        case 'tomorrow':
            return offset === 1;
        case '3d':
            return offset >= 0 && offset < 3;
        case 'week':
            return offset >= 0 && offset < 7;
    }
}

/** Filter then sort: kick-off ascending, or a ranked sort descending with kick-off as the tiebreak. */
export function selectFixtures(
    fixtures: FixtureSummary[],
    filters: Filters,
    tz: string,
    todayKey: string | null,
): FixtureSummary[] {
    const filtered = fixtures.filter(
        (f) =>
            (filters.league === 'all' || f.league === filters.league) &&
            (!filters.enrichedOnly || f.dataQuality === 'enriched') &&
            inBucket(todayKey ? dayOffset(f.kickoff, tz, todayKey) : null, filters.date),
    );
    return filtered.sort((a, b) => {
        if (filters.sort === 'kickoff') return a.kickoff.localeCompare(b.kickoff);
        const diff = sortValue(b, filters.sort) - sortValue(a, filters.sort);
        return diff !== 0 ? diff : a.kickoff.localeCompare(b.kickoff);
    });
}
