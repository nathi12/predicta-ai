// app/api/cron/grade/route.ts
// Grades predictions and curated slips whose matches have finished. Triggered by
// Vercel Cron (see vercel.json) or manually with the CRON_SECRET.
//
// On Vercel Hobby, cron runs once per day, so one invocation clears a whole
// day's backlog: all finished-match lookups are done in a single batched
// getMatchesByIds() call shared between the prediction and slip passes.

import { NextResponse, after, type NextRequest } from 'next/server';
import { CRON_SECRET } from '@/lib/env';
import { log } from '@/lib/log';
import type { SlipRecord } from '@/types';
import { getMatchesByIds, type FDMatch } from '@/services/footballData';
import { gradePrediction, pendingMatchIds, getTracked, pushRecent } from '@/lib/tracking';
import { gradeSlip, getSlip, pendingSlipIds } from '@/lib/slipTracking';
import { warmUpcomingMatches } from '@/lib/matchData';
import { warmUpcomingOdds } from '@/lib/oddsData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SETTLE_MS = 2.5 * 3_600_000; // match + stoppage + buffer

function authorized(req: NextRequest): boolean {
    if (!CRON_SECRET) return process.env.NODE_ENV !== 'production';
    const header = req.headers.get('authorization');
    return header === `Bearer ${CRON_SECRET}` || req.nextUrl.searchParams.get('key') === CRON_SECRET;
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
    const predIds = await pendingMatchIds();
    const duePreds: { matchId: string; footballDataId: number }[] = [];
    for (const matchId of predIds) {
        const tracked = await getTracked(matchId);
        if (!tracked) continue;
        if (new Date(tracked.kickoff).getTime() + SETTLE_MS > now) continue;
        const id = fdId(matchId);
        if (Number.isFinite(id)) duePreds.push({ matchId, footballDataId: id });
    }

    const slipIds = await pendingSlipIds();
    const dueSlips: SlipRecord[] = [];
    for (const id of slipIds) {
        const rec = await getSlip(id);
        if (!rec) continue;
        if (rec.legs.some((l) => new Date(l.kickoff).getTime() + SETTLE_MS > now)) continue;
        dueSlips.push(rec);
    }

    if (duePreds.length === 0 && dueSlips.length === 0) {
        return { pendingPreds: predIds.length, pendingSlips: slipIds.length, graded: 0, slipsGraded: 0 };
    }

    // --- one batched final-score lookup for everything --------------
    const wanted = new Set<number>();
    for (const d of duePreds) wanted.add(d.footballDataId);
    for (const s of dueSlips) for (const l of s.legs) wanted.add(fdId(l.matchId));

    const matches = await getMatchesByIds([...wanted].filter(Number.isFinite));
    const byId = new Map(matches.map((m) => [m.id, m]));

    // --- grade predictions ----------------------------------------
    let graded = 0;
    for (const { matchId, footballDataId } of duePreds) {
        const score = finalScore(byId.get(footballDataId));
        if (!score) continue;
        const tracked = await getTracked(matchId);
        if (!tracked) continue;
        await gradePrediction(tracked, score.home, score.away);
        await pushRecent(matchId);
        graded++;
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
        if (complete && (await gradeSlip(rec, finals))) slipsGraded++;
    }

    return {
        pendingPreds: predIds.length,
        pendingSlips: slipIds.length,
        duePreds: duePreds.length,
        dueSlips: dueSlips.length,
        graded,
        slipsGraded,
    };
}

/**
 * Rebuild the page caches so the day's first visitors don't trigger a cold
 * build. Runs after the response (best-effort — may be cut short by maxDuration,
 * which is fine: the grading that matters has already completed).
 */
async function warm(): Promise<void> {
    try {
        await warmUpcomingMatches();
        await warmUpcomingOdds();
    } catch (err) {
        log.warn('cache warm failed', (err as Error).message);
    }
}

export async function GET(req: NextRequest) {
    if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    try {
        const summary = await run();
        after(warm);
        log.debug('grade cron', summary);
        return NextResponse.json({ ok: true, ...summary });
    } catch (err) {
        log.error('grade cron failed', (err as Error).message);
        return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
    }
}

export const POST = GET;
