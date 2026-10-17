// lib/matchData.ts
// Assembles upcoming fixtures + team strength profiles + predictions.
// One KV-cached entry point: getUpcomingMatches().

import 'server-only';
import { store, tryLock } from '@/lib/kv';
import { keepAlive, singleFlight } from '@/lib/flight';
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
    getFixtureInsight,
    resolveFixture,
    type AFFixtureRef,
    type ApiFootballInsight,
} from '@/services/apiFootball';
import { buildRatings, seedFromRecord, type FinishedResult } from '@/lib/prediction/elo';
import { computeLeagueAverages, halfOf } from '@/lib/prediction/strength';
import { calibrationFromStats } from '@/lib/prediction/calibrate';
import { predictMatch } from '@/lib/prediction';
import { recordPrediction, getRollingStats } from '@/lib/tracking';
import { getAllCornerRates, pickRates, queueBackfillIfNeeded } from '@/lib/cornerRates';
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
    /** Every team's strength profile — an array so the bundle survives JSON. */
    teams: TeamStrength[];
    averages: ReturnType<typeof computeLeagueAverages>;
    fixtures: FDMatch[];
    /** Build time (ms); the bundle is fresh for BUNDLE_FRESH_MS. */
    builtAt: number;
}

/** Fetch and build one league. null = the fetch failed; an empty fixture window is a valid bundle. */
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
    if (fixtures.length === 0) {
        return {
            code,
            teams: [],
            averages: computeLeagueAverages([], [], cfg),
            fixtures: [],
            builtAt: Date.now(),
        };
    }

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

    const teams: TeamStrength[] = standings.total.map((r) => {
        const overall = rowToSplit(r);
        const home = rowToSplit(homeById.get(r.team.id));
        const away = rowToSplit(awayById.get(r.team.id));
        const form = parseForm(r.form);
        return {
            team: toTeam(r),
            overall,
            home: home.played > 0 ? home : halfOf(overall),
            away: away.played > 0 ? away : halfOf(overall),
            form: form.length > 0 ? form : (recentForm.get(r.team.id) ?? []),
            elo: ratings.get(r.team.id) ?? 1500,
        };
    });

    const averages = computeLeagueAverages(
        standings.home.map(rowToSplit),
        standings.away.map(rowToSplit),
        cfg,
    );

    return { code, teams, averages, fixtures, builtAt: Date.now() };
}

// --- per-league bundle cache ---------------------------------------------
//
// Football-Data's free tier is 10 req/min and a league costs up to three calls,
// so refreshing all six can take minutes — longer than one serverless
// invocation. Bundles are cached per league: each rebuild refreshes the stalest
// leagues it has time for and serves the rest from their last good bundle.

const bundleKey = (code: LeagueCode) => `league:v1:${code}`;
const BUNDLE_FRESH_MS = 15 * 60_000;
const BUNDLE_TTL = 48 * 60 * 60;
/** Don't start a league refresh later than this into the build. */
const LEAGUE_REFRESH_BUDGET_MS = 25_000;
/** Don't start an optional per-fixture lookup (h2h, API-Football) later than this. */
const ENRICH_BUDGET_MS = 40_000;

/** Every league's bundle, refreshed as time allows. `complete` = all of them fresh. */
async function loadBundles(origin: number): Promise<{ bundles: LeagueBundle[]; complete: boolean }> {
    const prior = await store.mget<LeagueBundle>(LEAGUE_CODES.map(bundleKey));
    const slots = LEAGUE_CODES.map((code, i) => ({ code, prev: prior[i] }));
    // Stalest first, so successive rebuilds work through every league in turn.
    slots.sort((a, b) => (a.prev?.builtAt ?? 0) - (b.prev?.builtAt ?? 0));

    const bundles: LeagueBundle[] = [];
    let complete = true;
    // Sequential, not Promise.all: lets the shared 10-req/min budget pace the
    // calls so every refreshed league gets a complete pull instead of 429s.
    for (const { code, prev } of slots) {
        if (prev && Date.now() - prev.builtAt < BUNDLE_FRESH_MS) {
            bundles.push(prev);
            continue;
        }
        const built =
            Date.now() - origin < LEAGUE_REFRESH_BUDGET_MS ? await buildLeague(code) : null;
        if (built) {
            await store.set(bundleKey(code), built, BUNDLE_TTL);
            bundles.push(built);
        } else {
            complete = false;
            if (prev) bundles.push(prev);
        }
    }
    return { bundles, complete };
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

/**
 * Build the slate. `origin` is when the surrounding invocation started — the
 * time budgets count from it so the build fits inside the function limit.
 */
async function assemble(
    origin: number,
): Promise<{ matches: MatchWithPrediction[]; complete: boolean }> {
    const { bundles, complete } = await loadBundles(origin);
    const canEnrich = () => Date.now() - origin < ENRICH_BUDGET_MS;

    // Flatten fixtures, sorted by kickoff.
    type Pending = { bundle: LeagueBundle; teams: Map<number, TeamStrength>; fx: FDMatch };
    const pending: Pending[] = [];
    for (const bundle of bundles) {
        const teams = new Map(bundle.teams.map((t) => [t.team.id, t]));
        for (const fx of bundle.fixtures) pending.push({ bundle, teams, fx });
    }
    pending.sort((a, b) => a.fx.utcDate.localeCompare(b.fx.utcDate));

    const now = Date.now();
    let h2hBudget = H2H_LIMIT_PER_BUILD;
    let afBudget = Math.max(0, (await budgetRemaining()) - 6); // keep headroom

    // Recalibration curves learned from the grading log; undefined (→ identity)
    // until enough predictions have been graded. 1X2 and corners are learned
    // separately so a thin corners sample never gates the 1X2 curve; the raw
    // curves come from the live model version's own grades.
    const [allTime, current] = await Promise.all([getRollingStats('all'), getRollingStats('model')]);
    const calibration = allTime ? calibrationFromStats(allTime, current) : undefined;

    // Every team's rolling corners-per-game history, read once for the whole build.
    const cornerRates = await getAllCornerRates();

    const out: MatchWithPrediction[] = [];

    for (const { bundle, teams, fx } of pending) {
        const hoursAhead = (new Date(fx.utcDate).getTime() - now) / 3_600_000;
        // A stale bundle can still list a fixture that has since kicked off —
        // never publish (or re-log) a prediction after kickoff.
        if (hoursAhead <= 0) continue;

        const cfg = LEAGUES[bundle.code];
        // Copies: enrichment is applied per fixture and must not leak into the
        // same team's other fixtures in the window.
        const home = { ...(teams.get(fx.homeTeam.id) ?? fallbackStrength(fx.homeTeam)) };
        const away = { ...(teams.get(fx.awayTeam.id) ?? fallbackStrength(fx.awayTeam)) };

        let h2h: HeadToHead | undefined;
        if (h2hBudget > 0 && hoursAhead <= H2H_HOURS_AHEAD && canEnrich()) {
            h2h = (await getHeadToHead(fx.id)) ?? undefined;
            h2hBudget--;
        }

        // Resolve the API-Football fixture + team ids for near-term fixtures — the
        // slip builder needs the fixture id for odds, the corners model needs the
        // team ids. Gated on a healthy budget; shares the cached fixture index.
        let afRef: AFFixtureRef | undefined;
        if (hasApiFootball() && afBudget >= 2 && hoursAhead <= AF_ID_HOURS_AHEAD && canEnrich()) {
            afRef = await resolveApiFootballFixtureId(fx, bundle.code);
        }
        const apiFootballFixtureId = afRef?.fixtureId;

        // Queue either side for a corner-rate backfill when the venue it's about
        // to play has a thin sample. No API cost — just a KV add on data already
        // in hand; the grade cron drains it a few teams a day.
        if (afRef) {
            void queueBackfillIfNeeded(afRef.homeId, cornerRates[afRef.homeId], 'atHome').catch(
                () => {},
            );
            void queueBackfillIfNeeded(afRef.awayId, cornerRates[afRef.awayId], 'atAway').catch(
                () => {},
            );
        }

        let dataQuality: EnrichedMatch['dataQuality'] = 'core';
        let providerOutcome: EnrichedMatch['providerOutcome'];

        if (apiFootballFixtureId && afBudget >= 2 && hoursAhead <= ENRICH_HOURS_AHEAD && canEnrich()) {
            const insight = await getFixtureInsight(apiFootballFixtureId).catch(() => null);
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

    return { matches: out, complete };
}

/** Match a Football-Data fixture to its API-Football fixture + team ids. */
async function resolveApiFootballFixtureId(
    fx: FDMatch,
    code: LeagueCode,
): Promise<AFFixtureRef | undefined> {
    try {
        const ref = await resolveFixture({
            kickoff: fx.utcDate,
            leagueId: LEAGUES[code].apiFootballId,
            homeNames: [fx.homeTeam.name, fx.homeTeam.shortName].filter(
                (s): s is string => !!s,
            ),
            awayNames: [fx.awayTeam.name, fx.awayTeam.shortName].filter(
                (s): s is string => !!s,
            ),
        });
        return ref ?? undefined;
    } catch (err) {
        log.warn('api-football fixture id lookup failed', (err as Error).message);
        return undefined;
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
/** A slate built partly from stale league bundles is retried sooner. */
const PARTIAL_TTL = 2 * 60;
const STALE_TTL = 48 * 60 * 60;
// One slate build at a time across instances — each one spends the shared
// free-tier API budgets. Outlives the 60s function limit as a safety net.
const BUILD_LOCK = 'lock:matches';
const BUILD_LOCK_TTL = 90;

/**
 * Upcoming fixtures + predictions. Stale-while-revalidate: once a good build
 * exists, callers get it (or the last good build) instantly and any rebuild runs
 * detached — only a cold start (nothing cached at all) ever waits.
 */
export async function getUpcomingMatches(): Promise<MatchWithPrediction[]> {
    const fresh = await store.get<MatchWithPrediction[]>(CACHE_KEY);
    if (fresh && fresh.length > 0) return fresh;

    const rebuild = ensureAssemble(Date.now());

    const stale = await store.get<MatchWithPrediction[]>(STALE_KEY);
    if (stale && stale.length > 0) {
        keepAlive(rebuild);
        return stale;
    }
    return (await rebuild) ?? (await waitForBuild());
}

/**
 * Rebuild the slate unless another instance already is. Resolves to the new
 * slate (or the last good one), or null when the build lock is held elsewhere.
 */
function ensureAssemble(origin: number): Promise<MatchWithPrediction[] | null> {
    return singleFlight('matches', async () => {
        const release = await tryLock(BUILD_LOCK, BUILD_LOCK_TTL);
        if (!release) return null;
        try {
            const { matches, complete } = await assemble(origin);
            if (matches.length > 0) {
                await store.set(CACHE_KEY, matches, complete ? FRESH_TTL : PARTIAL_TTL);
                await store.set(STALE_KEY, matches, STALE_TTL);
                return matches;
            }
            // Nothing came back (rate limits / outage) — never overwrite a
            // good cache with an empty one; serve the last good build.
            return (await store.get<MatchWithPrediction[]>(STALE_KEY)) ?? [];
        } finally {
            await release();
        }
    });
}

/**
 * Cold start while another instance holds the build lock: wait for its slate.
 * The lock is read before the slate — the builder writes the slate before it
 * releases — so a released lock with no slate means that build came back empty.
 */
async function waitForBuild(): Promise<MatchWithPrediction[]> {
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 2_000));
        const building = await store.get<string>(BUILD_LOCK);
        const built = await store.get<MatchWithPrediction[]>(STALE_KEY);
        if (built && built.length > 0) return built;
        if (!building) return [];
    }
    return [];
}

/**
 * Rebuild the caches ahead of traffic if stale (called by the daily cron).
 * `origin` is the cron invocation's start, so the build respects its time limit.
 */
export async function warmUpcomingMatches(origin = Date.now()): Promise<number> {
    const fresh = await store.get<MatchWithPrediction[]>(CACHE_KEY);
    if (fresh && fresh.length > 0) return fresh.length;
    return (await ensureAssemble(origin))?.length ?? 0;
}
