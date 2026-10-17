// app/api/cron/grade/route.ts
// Grades predictions and curated slips whose matches have finished. Triggered by
// Vercel Cron (see vercel.json) or manually with the CRON_SECRET.
//
// On Vercel Hobby, cron runs once per day, so one invocation clears a whole
// day's backlog: all finished-match lookups are done in a single batched
// getMatchesByIds() call shared between the prediction and slip passes.
//
// A third pass then grades the corners markets off API-Football match stats
// (football-data.org has no corner counts). It's rate-limited hard — see
// drainCorners — so it stays well inside the shared free-tier budget.

import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse, after, type NextRequest } from 'next/server';
import { CRON_SECRET } from '@/lib/env';
import { tryLock } from '@/lib/kv';
import { log } from '@/lib/log';
import type { SlipRecord, TrackedPrediction } from '@/types';
import { getMatchesByIds, type FDMatch } from '@/services/footballData';
import {
    budgetRemaining,
    cornersBudgetRemaining,
    cornersBackfillBudgetRemaining,
    getFixtureCorners,
    getTeamRecentFixtures,
} from '@/services/apiFootball';
import {
    gradePrediction,
    pendingMatchIds,
    getMarketMany,
    getTrackedMany,
    pushRecent,
    pendingCornerIds,
    gradeCorners,
    discardPending,
    discardPendingCorner,
} from '@/lib/tracking';
import {
    pendingBackfillTeamIds,
    dequeueBackfillTeam,
    foldFixtureCorners,
} from '@/lib/cornerRates';
import {
    discardPendingSlip,
    gradeSlip,
    getSlips,
    pendingSlipIds,
    recordPresetSlips,
} from '@/lib/slipTracking';
import { getUpcomingMatches, warmUpcomingMatches } from '@/lib/matchData';
import { getUpcomingOdds, warmUpcomingOdds } from '@/lib/oddsData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SETTLE_MS = 2.5 * 3_600_000; // match + stoppage + buffer
// No final score a week after kickoff = postponed or abandoned. Drop it from the
// queue; a rescheduled fixture is re-queued by the next build that predicts it.
const VOID_AFTER_MS = 7 * 24 * 3_600_000;
// One grading run at a time across instances (a retried cron delivery, a manual
// trigger). The run is the only writer of the read-modify-write aggregates —
// rolling stats, corner rates, recent lists — so this lock is what keeps them
// from losing updates. Outlives maxDuration as a safety net.
const RUN_LOCK = 'lock:cron:grade';
const RUN_LOCK_TTL = 120;

const digest = (s: string) => createHash('sha256').update(s).digest();

// Header only — a secret in the query string ends up in access logs. Hashing
// both sides gives equal-length buffers for the constant-time compare.
function authorized(req: NextRequest): boolean {
    if (!CRON_SECRET) return process.env.NODE_ENV !== 'production';
    const header = req.headers.get('authorization') ?? '';
    return timingSafeEqual(digest(header), digest(`Bearer ${CRON_SECRET}`));
}

const fdId = (matchId: string): number => Number(matchId.split('-')[1]);

const finalScore = (m: FDMatch | undefined): { home: number; away: number } | null => {
    const h = m?.score?.fullTime?.home;
    const a = m?.score?.fullTime?.away;
    return m?.status === 'FINISHED' && h != null && a != null ? { home: h, away: a } : null;
};

async function run() {
    const now = Date.now();

    // --- collect what's due ------------------------------------------
    // Records expire (45d); an id whose record is gone can never be graded, so
    // it leaves the queue instead of being re-scanned on every run.
    let discarded = 0;
    const predIds = await pendingMatchIds();
    const trackedAll = await getTrackedMany(predIds);
    const duePreds: { matchId: string; footballDataId: number; tracked: TrackedPrediction }[] = [];
    for (const [i, matchId] of predIds.entries()) {
        const tracked = trackedAll[i];
        const id = fdId(matchId);
        if (!tracked || !Number.isFinite(id)) {
            await discardPending(matchId);
            discarded++;
            continue;
        }
        if (new Date(tracked.kickoff).getTime() + SETTLE_MS > now) continue;
        duePreds.push({ matchId, footballDataId: id, tracked });
    }

    const slipIds = await pendingSlipIds();
    const slipsAll = await getSlips(slipIds);
    const dueSlips: SlipRecord[] = [];
    for (const [i, id] of slipIds.entries()) {
        const rec = slipsAll[i];
        if (!rec) {
            await discardPendingSlip(id);
            discarded++;
            continue;
        }
        if (rec.legs.some((l) => new Date(l.kickoff).getTime() + SETTLE_MS > now)) continue;
        dueSlips.push(rec);
    }

    if (duePreds.length === 0 && dueSlips.length === 0) {
        const corners = await drainCorners(now);
        const backfill = await drainCornerBackfill();
        return {
            pendingPreds: predIds.length,
            pendingSlips: slipIds.length,
            graded: 0,
            slipsGraded: 0,
            discarded,
            ...corners,
            ...backfill,
        };
    }

    // --- one batched final-score lookup for everything --------------
    const wanted = new Set<number>();
    for (const d of duePreds) wanted.add(d.footballDataId);
    for (const s of dueSlips) for (const l of s.legs) wanted.add(fdId(l.matchId));

    const matches = await getMatchesByIds([...wanted].filter(Number.isFinite));
    const byId = new Map(matches.map((m) => [m.id, m]));

    // --- grade predictions ----------------------------------------
    // Each with the market's logged pre-kickoff line, where there is one.
    const markets = await getMarketMany(duePreds.map((d) => d.matchId));
    let graded = 0;
    for (const [i, { matchId, footballDataId, tracked }] of duePreds.entries()) {
        const score = finalScore(byId.get(footballDataId));
        if (!score) {
            if (now - new Date(tracked.kickoff).getTime() > VOID_AFTER_MS) {
                await discardPending(matchId);
                discarded++;
            }
            continue;
        }
        if (await gradePrediction(tracked, score.home, score.away, markets[i])) {
            await pushRecent(matchId);
            graded++;
        }
    }

    // --- grade slips (all legs must have a final score) -----------
    let slipsGraded = 0;
    for (const rec of dueSlips) {
        const finals = new Map<string, { home: number; away: number }>();
        let complete = true;
        for (const l of rec.legs) {
            const score = finalScore(byId.get(fdId(l.matchId)));
            if (!score) {
                complete = false;
                break;
            }
            finals.set(l.matchId, score);
        }
        if (complete) {
            if (await gradeSlip(rec, finals)) slipsGraded++;
        } else if (rec.legs.some((l) => now - new Date(l.kickoff).getTime() > VOID_AFTER_MS)) {
            // A leg that still has no result a week on is void; the slip can't settle.
            await discardPendingSlip(rec.slipId);
            discarded++;
        }
    }

    const corners = await drainCorners(now);
    const backfill = await drainCornerBackfill();

    return {
        pendingPreds: predIds.length,
        pendingSlips: slipIds.length,
        duePreds: duePreds.length,
        dueSlips: dueSlips.length,
        graded,
        slipsGraded,
        discarded,
        ...corners,
        ...backfill,
    };
}

// Corners are graded off API-Football match stats, one request per fixture.
// Three brakes keep it inside the free tier: a per-run cap (the 60s function
// limit), a shared-budget headroom (leave room for enrichment + odds), and the
// service's own daily corners sub-budget. Newest fixtures go first so the live
// sample is always covered; a backlog just drains over the following days, and
// anything still unresolved after two weeks is dropped.
const CORNERS_PER_RUN = 12;
const AF_BUDGET_HEADROOM = 25;
const CORNERS_MAX_AGE_MS = 14 * 24 * 3_600_000;

async function drainCorners(now: number): Promise<{ pendingCorners: number; cornersGraded: number }> {
    const ids = await pendingCornerIds();
    if (ids.length === 0) return { pendingCorners: 0, cornersGraded: 0 };

    const [shared, cornerBudget] = await Promise.all([budgetRemaining(), cornersBudgetRemaining()]);
    const cap = Math.min(
        CORNERS_PER_RUN,
        cornerBudget,
        Math.max(0, shared - AF_BUDGET_HEADROOM),
    );
    if (cap === 0) return { pendingCorners: ids.length, cornersGraded: 0 };

    // Grade the freshest matches first; stale ones can wait or age out.
    const queue: Array<{ matchId: string; tracked: TrackedPrediction }> = [];
    const trackedAll = await getTrackedMany(ids);
    for (const [i, matchId] of ids.entries()) {
        const tracked = trackedAll[i];
        if (!tracked || !tracked.apiFootballFixtureId || tracked.markets.corners95 == null) {
            await discardPendingCorner(matchId);
            continue;
        }
        if (now - new Date(tracked.kickoff).getTime() > CORNERS_MAX_AGE_MS) {
            await discardPendingCorner(matchId);
            continue;
        }
        queue.push({ matchId, tracked });
    }
    queue.sort((a, b) => b.tracked.kickoff.localeCompare(a.tracked.kickoff));

    let cornersGraded = 0;
    let spent = 0;
    for (const { matchId, tracked } of queue) {
        if (spent >= cap) break;
        spent++;
        const corners = await getFixtureCorners(tracked.apiFootballFixtureId!);
        if (corners == null) continue; // stats not up yet, or sub-budget spent — retry next run
        // gradeCorners folds both the hit/miss and each side's count into the
        // model's corner-rate history, once, past its idempotency gate.
        if (await gradeCorners(matchId, corners.total, corners.byTeamId)) cornersGraded++;
    }

    return { pendingCorners: ids.length, cornersGraded };
}

// Seed the venue-split corner-rate history straight from the provider for teams
// that are about to play but don't have enough graded games yet (queued by
// lib/matchData.ts). Its own sub-budget keeps it clear of live grading; full
// coverage builds up over weeks, aimed at the teams that matter first.
const BACKFILL_TEAMS_PER_RUN = 4;
const BACKFILL_LAST = 8;

async function drainCornerBackfill(): Promise<{ backfillTeams: number; backfillFolded: number }> {
    const teamIds = await pendingBackfillTeamIds();
    if (teamIds.length === 0) return { backfillTeams: 0, backfillFolded: 0 };

    const [shared, backfillBudget] = await Promise.all([
        budgetRemaining(),
        cornersBackfillBudgetRemaining(),
    ]);
    if (backfillBudget <= 0 || shared - AF_BUDGET_HEADROOM <= 0) {
        return { backfillTeams: 0, backfillFolded: 0 };
    }

    let backfillTeams = 0;
    let backfillFolded = 0;
    for (const teamId of teamIds.slice(0, BACKFILL_TEAMS_PER_RUN)) {
        // Only start a team when the shared budget can absorb its worst case.
        if ((await budgetRemaining()) - AF_BUDGET_HEADROOM <= BACKFILL_LAST) break;

        const fixtures = await getTeamRecentFixtures(teamId, BACKFILL_LAST);
        if (fixtures == null) break; // provider down or budget spent — retry next run

        let starved = false;
        for (const fx of fixtures) {
            const corners = await getFixtureCorners(fx.fixtureId, 'backfill');
            if (corners == null) {
                // null is "stats not up" (skip) or "sub-budget spent" (stop).
                if ((await cornersBackfillBudgetRemaining()) <= 0) {
                    starved = true;
                    break;
                }
                continue;
            }
            if (await foldFixtureCorners(fx.fixtureId, corners.byTeamId, fx.homeId, fx.awayId)) {
                backfillFolded++;
            }
        }
        if (starved) break;
        // Anything still thin for this team gets re-queued by the next slate build.
        await dequeueBackfillTeam(teamId);
        backfillTeams++;
    }

    return { backfillTeams, backfillFolded };
}

/**
 * Rebuild the page caches so the day's first visitors don't trigger a cold
 * build, then log the day's preset slips off the fresh slate. Runs after the
 * response (best-effort — may be cut short by maxDuration, which is fine: the
 * grading that matters has already completed). The slips are logged even if the
 * warm fails, from whatever slate is cached.
 */
async function warm(origin: number): Promise<void> {
    try {
        await warmUpcomingMatches(origin);
        await warmUpcomingOdds();
    } catch (err) {
        log.warn('cache warm failed', (err as Error).message);
    }
    try {
        const [matches, odds] = await Promise.all([getUpcomingMatches(), getUpcomingOdds()]);
        log.debug('preset slips logged', await recordPresetSlips(matches, odds));
    } catch (err) {
        log.warn('preset slip logging failed', (err as Error).message);
    }
}

export async function GET(req: NextRequest) {
    const startedAt = Date.now();
    if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const release = await tryLock(RUN_LOCK, RUN_LOCK_TTL);
    if (!release) {
        return NextResponse.json({ ok: false, error: 'already running' }, { status: 409 });
    }
    try {
        const summary = await run();
        after(() => warm(startedAt));
        log.debug('grade cron', summary);
        return NextResponse.json({ ok: true, ...summary });
    } catch (err) {
        log.error('grade cron failed', (err as Error).message);
        return NextResponse.json({ ok: false, error: 'grading failed' }, { status: 500 });
    } finally {
        await release();
    }
}

export const POST = GET;
