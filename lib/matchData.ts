// lib/matchData.ts
// Assembles upcoming fixtures + team strength profiles + predictions.
// One KV-cached entry point: getUpcomingMatches().

import 'server-only';
import { after } from 'next/server';
import { store } from '@/lib/kv';
import { hasApiFootball } from '@/lib/env';
import { log } from '@/lib/log';
import { LEAGUES, LEAGUE_CODES } from '@/lib/leagues';
import {
    getCompetitionMatches,
    getFinishedMatches,
    getHeadToHead,
    getStandings,
    type FDMatch,
    type FDTableRow,
} from '@/services/footballData';
import {
    budgetRemaining,
    getFixturesByDate,
    getFixtureInsight,
    normalizeTeam,
    type AFFixtureRef,
    type ApiFootballInsight,
} from '@/services/apiFootball';
import { buildRatings, seedFromRecord, type FinishedResult } from '@/lib/prediction/elo';
import { computeLeagueAverages } from '@/lib/prediction/strength';
import { buildCalibrationMap } from '@/lib/prediction/calibrate';
import { predictMatch } from '@/lib/prediction';
import { recordPrediction, getRollingStats } from '@/lib/tracking';
import { getAllCornerRates, pickRates } from '@/lib/cornerRates';
import type {
    EnrichedMatch,
    HeadToHead,
    LeagueCode,
    MatchWithPrediction,
    RecordSplit,
    Team,
    TeamStrength,
} from '@/types';

const WINDOW_DAYS = 10;
const H2H_LIMIT_PER_BUILD = 6;
const H2H_HOURS_AHEAD = 60;
const ENRICH_HOURS_AHEAD = 72;
/** Resolve the API-Football fixture id this far out so the slip builder can price odds. */
const AF_ID_HOURS_AHEAD = 120;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function rowToSplit(r: FDTableRow | undefined): RecordSplit {
    if (!r) return { played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
    return {
        played: r.playedGames,
        won: r.won,
        draw: r.draw,
        lost: r.lost,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
    };
}

function parseForm(form: string | null | undefined): Array<'W' | 'D' | 'L'> {
    if (!form) return [];
    return form
        .split(/[,\s]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c): c is 'W' | 'D' | 'L' => c === 'W' || c === 'D' || c === 'L')
        .reverse(); // most-recent first
}

function toTeam(r: FDTableRow): Team {
    return {
        id: r.team.id,
        name: r.team.name,
        shortName: r.team.shortName || r.team.name,
        tla: r.team.tla || r.team.shortName?.slice(0, 3).toUpperCase() || '',
        crest: r.team.crest,
    };
}

interface LeagueBundle {
    code: LeagueCode;
    teams: Map<number, TeamStrength>;
    averages: ReturnType<typeof computeLeagueAverages>;
    fixtures: FDMatch[];
}

async function buildLeague(code: LeagueCode): Promise<LeagueBundle | null> {
    const cfg = LEAGUES[code];
    let standings: Awaited<ReturnType<typeof getStandings>>;
    let fixtures: FDMatch[];
    try {
        [standings, fixtures] = await Promise.all([
            getStandings(code),
            getCompetitionMatches(code, isoDate(new Date()), isoDate(addDays(new Date(), WINDOW_DAYS))),
        ]);
    } catch (err) {
        log.warn(`league ${code} fetch failed`, (err as Error).message);
        return null;
    }
    if (fixtures.length === 0) return null;

    const maxPlayed = standings.total.reduce((m, r) => Math.max(m, r.playedGames), 0);
    const finished =
        maxPlayed >= 1
            ? await getFinishedMatches(code, cfg.season).catch(() => [] as FDMatch[])
            : [];

    const homeById = new Map(standings.home.map((r) => [r.team.id, r]));
    const awayById = new Map(standings.away.map((r) => [r.team.id, r]));

    // Elo: seed from the total table, refine with finished results.
    const seeds = new Map<number, number>();
    for (const r of standings.total) {
        seeds.set(r.team.id, seedFromRecord(r.points, r.playedGames, r.goalsFor, r.goalsAgainst));
    }
    const results: FinishedResult[] = finished
        .filter((m) => m.score?.fullTime?.home != null && m.score?.fullTime?.away != null)
        .map((m) => ({
            homeId: m.homeTeam.id,
            awayId: m.awayTeam.id,
            homeGoals: m.score!.fullTime!.home as number,
            awayGoals: m.score!.fullTime!.away as number,
            kickoff: m.utcDate,
        }));
    const ratings = buildRatings(seeds, results);

    // Football-Data's `form` field is empty for the first few rounds, so derive
    // recent form from the finished-match feed instead.
    const recentForm = buildRecentForm(finished);

    const teams = new Map<number, TeamStrength>();
    for (const r of standings.total) {
        const overall = rowToSplit(r);
        const home = rowToSplit(homeById.get(r.team.id));
        const away = rowToSplit(awayById.get(r.team.id));
        const form = parseForm(r.form);
        teams.set(r.team.id, {
            team: toTeam(r),
            overall,
            home: home.played > 0 ? home : halfOf(overall),
            away: away.played > 0 ? away : halfOf(overall),
            form: form.length > 0 ? form : (recentForm.get(r.team.id) ?? []),
            elo: ratings.get(r.team.id) ?? 1500,
        });
    }

    const averages = computeLeagueAverages(
        standings.home.map(rowToSplit),
        standings.away.map(rowToSplit),
        cfg,
    );

    return { code, teams, averages, fixtures };
}

/** Last-5 results per team (most recent first) from the finished-match feed. */
function buildRecentForm(finished: FDMatch[]): Map<number, Array<'W' | 'D' | 'L'>> {
    const byTeam = new Map<number, Array<{ date: string; r: 'W' | 'D' | 'L' }>>();
    const push = (id: number, date: string, r: 'W' | 'D' | 'L') => {
        const arr = byTeam.get(id) ?? [];
        arr.push({ date, r });
        byTeam.set(id, arr);
    };
    for (const m of finished) {
        const h = m.score?.fullTime?.home;
        const a = m.score?.fullTime?.away;
        if (h == null || a == null) continue;
        push(m.homeTeam.id, m.utcDate, h > a ? 'W' : h === a ? 'D' : 'L');
        push(m.awayTeam.id, m.utcDate, a > h ? 'W' : a === h ? 'D' : 'L');
    }
    const out = new Map<number, Array<'W' | 'D' | 'L'>>();
    for (const [id, arr] of byTeam) {
        arr.sort((x, y) => y.date.localeCompare(x.date));
        out.set(
            id,
            arr.slice(0, 5).map((x) => x.r),
        );
    }
    return out;
}

function halfOf(r: RecordSplit): RecordSplit {
    return {
        played: Math.round(r.played / 2),
        won: Math.round(r.won / 2),
        draw: Math.round(r.draw / 2),
        lost: Math.round(r.lost / 2),
        goalsFor: r.goalsFor / 2,
        goalsAgainst: r.goalsAgainst / 2,
    };
}

function addDays(d: Date, n: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function fallbackStrength(t: FDMatch['homeTeam']): TeamStrength {
    const empty: RecordSplit = { played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
    return {
        team: {
            id: t.id,
            name: t.name,
            shortName: t.shortName || t.name,
            tla: t.tla || '',
            crest: t.crest,
        },
        overall: empty,
        home: empty,
        away: empty,
        form: [],
        elo: 1500,
    };
}

async function assemble(): Promise<MatchWithPrediction[]> {
    // Sequential, not Promise.all: lets the shared 10-req/min budget pace the
    // calls so every league gets a complete pull instead of half of them 429ing.
    const bundles: LeagueBundle[] = [];
    for (const code of LEAGUE_CODES) {
        const b = await buildLeague(code);
        if (b) bundles.push(b);
    }

    // Flatten fixtures, sorted by kickoff.
    type Pending = { bundle: LeagueBundle; fx: FDMatch };
    const pending: Pending[] = [];
    for (const bundle of bundles) {
        for (const fx of bundle.fixtures) pending.push({ bundle, fx });
    }
    pending.sort((a, b) => a.fx.utcDate.localeCompare(b.fx.utcDate));

    const now = Date.now();
    let h2hBudget = H2H_LIMIT_PER_BUILD;
    let afBudget = Math.max(0, (await budgetRemaining()) - 6); // keep headroom

    // Recalibration curve learned from the grading log; undefined (→ identity)
    // until enough predictions have been graded.
    const calibrationStats = await getRollingStats();
    const calibration = calibrationStats
        ? buildCalibrationMap(calibrationStats.calibration)
        : undefined;

    // Every team's rolling corners-per-game history, read once for the whole build.
    const cornerRates = await getAllCornerRates();

    const out: MatchWithPrediction[] = [];

    for (const { bundle, fx } of pending) {
        const cfg = LEAGUES[bundle.code];
        const home = bundle.teams.get(fx.homeTeam.id) ?? fallbackStrength(fx.homeTeam);
        const away = bundle.teams.get(fx.awayTeam.id) ?? fallbackStrength(fx.awayTeam);
        const hoursAhead = (new Date(fx.utcDate).getTime() - now) / 3_600_000;

        let h2h: HeadToHead | undefined;
        if (h2hBudget > 0 && hoursAhead > 0 && hoursAhead <= H2H_HOURS_AHEAD) {
            h2h = (await getHeadToHead(fx.id)) ?? undefined;
            h2hBudget--;
        }

        // Resolve the API-Football fixture + team ids for near-term fixtures — the
        // slip builder needs the fixture id for odds, the corners model needs the
        // team ids. Gated on a healthy budget; shares the cached fixture index.
        let afRef: AFFixtureRef | undefined;
        if (hasApiFootball() && afBudget >= 2 && hoursAhead > 0 && hoursAhead <= AF_ID_HOURS_AHEAD) {
            afRef = await resolveApiFootballFixtureId(fx);
        }
        const apiFootballFixtureId = afRef?.fixtureId;

        let dataQuality: EnrichedMatch['dataQuality'] = 'core';
        let providerOutcome: EnrichedMatch['providerOutcome'];

        if (afBudget >= 2 && hoursAhead > 0 && hoursAhead <= ENRICH_HOURS_AHEAD) {
            const insight = apiFootballFixtureId
                ? await getFixtureInsight(apiFootballFixtureId).catch(() => null)
                : await enrich(bundle.code, fx);
            if (insight) {
                afBudget -= 2;
                dataQuality = 'enriched';
                applyInsight(home, away, insight);
                if (insight.probs) providerOutcome = insight.probs;
                if (!h2h && insight.h2h) h2h = insight.h2h;
            }
        }

        const match: EnrichedMatch = {
            id: `${bundle.code}-${fx.id}`,
            footballDataId: fx.id,
            apiFootballFixtureId,
            apiFootballHomeId: afRef?.homeId,
            apiFootballAwayId: afRef?.awayId,
            league: bundle.code,
            leagueName: cfg.name,
            kickoff: fx.utcDate,
            venue: fx.venue,
            home,
            away,
            h2h,
            providerOutcome,
            dataQuality,
        };

        const prediction = predictMatch(match, {
            leagueAverages: bundle.averages,
            calibration,
            cornerRates: pickRates(cornerRates, afRef?.homeId, afRef?.awayId),
        });
        out.push({ match, prediction });

        // Fire-and-forget: persist for later grading.
        recordPrediction(match, prediction).catch((e) =>
            log.warn('recordPrediction failed', (e as Error).message),
        );
    }

    return out;
}

/** Match a Football-Data fixture to its API-Football fixture + team ids. */
async function resolveApiFootballFixtureId(fx: FDMatch): Promise<AFFixtureRef | undefined> {
    try {
        const day = fx.utcDate.slice(0, 10);
        const index = await getFixturesByDate(day);
        const h = normalizeTeam(fx.homeTeam.name);
        const hs = normalizeTeam(fx.homeTeam.shortName || fx.homeTeam.name);
        const a = normalizeTeam(fx.awayTeam.name);
        const as = normalizeTeam(fx.awayTeam.shortName || fx.awayTeam.name);
        return (
            index[`${h}|${a}|${day}`] ??
            index[`${hs}|${as}|${day}`] ??
            index[`${h}|${as}|${day}`] ??
            index[`${hs}|${a}|${day}`]
        );
    } catch (err) {
        log.warn('api-football fixture id lookup failed', (err as Error).message);
        return undefined;
    }
}

async function enrich(code: LeagueCode, fx: FDMatch): Promise<ApiFootballInsight | null> {
    const ref = await resolveApiFootballFixtureId(fx);
    if (!ref) return null;
    try {
        return await getFixtureInsight(ref.fixtureId);
    } catch (err) {
        log.warn(`enrich ${code} failed`, (err as Error).message);
        return null;
    }
}

function applyInsight(home: TeamStrength, away: TeamStrength, insight: ApiFootballInsight): void {
    const sideToEnrichment = (s: ApiFootballInsight['home']) => ({
        recentGoalsFor: s.recentFor,
        recentGoalsAgainst: s.recentAgainst,
        attackRating: s.att,
        defenseRating: s.def,
        formPoints: s.formPoints,
    });
    if (Number.isFinite(insight.home.recentFor)) home.enriched = sideToEnrichment(insight.home);
    if (Number.isFinite(insight.away.recentFor)) away.enriched = sideToEnrichment(insight.away);
}

// v7: EnrichedMatch carries API-Football team ids; corners markets carry an
// expected total + source. Bump forces a clean rebuild past the old shape.
const CACHE_KEY = 'matches:v7';
const STALE_KEY = 'matches:v7:stale';
const FRESH_TTL = 15 * 60;
const STALE_TTL = 48 * 60 * 60;

// In-process single-flight: concurrent callers on one instance share one build.
const globalForFlight = globalThis as unknown as {
    __predictaAssemble?: Promise<MatchWithPrediction[]>;
};

/**
 * Upcoming fixtures + predictions. Stale-while-revalidate: once a good build
 * exists, callers get it (or the last good build) instantly and any rebuild runs
 * detached — only the very first load ever waits for the full 6-league fetch.
 */
export async function getUpcomingMatches(): Promise<MatchWithPrediction[]> {
    const fresh = await store.get<MatchWithPrediction[]>(CACHE_KEY);
    if (fresh && fresh.length > 0) return fresh;

    const rebuild = ensureAssemble();

    const stale = await store.get<MatchWithPrediction[]>(STALE_KEY);
    if (stale && stale.length > 0) {
        keepAlive(rebuild);
        return stale;
    }
    return rebuild;
}

function ensureAssemble(): Promise<MatchWithPrediction[]> {
    if (!globalForFlight.__predictaAssemble) {
        globalForFlight.__predictaAssemble = (async () => {
            try {
                const built = await assemble();
                if (built.length > 0) {
                    await store.set(CACHE_KEY, built, FRESH_TTL);
                    await store.set(STALE_KEY, built, STALE_TTL);
                    return built;
                }
                // Nothing came back (rate limits / outage) — never overwrite a
                // good cache with an empty one; serve the last good build.
                return (await store.get<MatchWithPrediction[]>(STALE_KEY)) ?? [];
            } finally {
                globalForFlight.__predictaAssemble = undefined;
            }
        })();
    }
    return globalForFlight.__predictaAssemble;
}

/** Extend the serverless invocation until a detached rebuild finishes, when possible. */
function keepAlive(p: Promise<unknown>): void {
    try {
        after(() => p.catch(() => {}));
    } catch {
        // Not in a request scope (script / test) — the single-flight promise
        // still runs; swallow its rejection so it isn't unhandled.
        p.catch(() => {});
    }
}

/** Rebuild the caches ahead of traffic if stale (called by the daily cron). */
export async function warmUpcomingMatches(): Promise<number> {
    const fresh = await store.get<MatchWithPrediction[]>(CACHE_KEY);
    if (fresh && fresh.length > 0) return fresh.length;
    return (await ensureAssemble()).length;
}
