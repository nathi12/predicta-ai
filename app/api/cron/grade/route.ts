// app/api/cron/grade/route.ts
// Grades predictions whose matches have finished. Triggered by Vercel Cron
// (see vercel.json) or manually with the CRON_SECRET.

import { NextResponse, type NextRequest } from 'next/server';
import { CRON_SECRET } from '@/lib/env';
import { log } from '@/lib/log';
import { getMatchesByIds, type FDMatch } from '@/services/footballData';
import { gradePrediction, pendingMatchIds, getTracked, pushRecent } from '@/lib/tracking';
import { gradeSlip, getSlip, pendingSlipIds } from '@/lib/slipTracking';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
    if (!CRON_SECRET) return process.env.NODE_ENV !== 'production';
    const header = req.headers.get('authorization');
    return header === `Bearer ${CRON_SECRET}` || req.nextUrl.searchParams.get('key') === CRON_SECRET;
}

async function run() {
    const ids = await pendingMatchIds();
    if (ids.length === 0) return { checked: 0, graded: 0 };

    const now = Date.now();
    const due: { matchId: string; footballDataId: number }[] = [];
    for (const matchId of ids) {
        const tracked = await getTracked(matchId);
        if (!tracked) continue;
        // Grade ~2.5h after kickoff (match + stoppage + buffer).
        if (new Date(tracked.kickoff).getTime() + 2.5 * 3_600_000 > now) continue;
        const fdId = Number(matchId.split('-')[1]);
        if (Number.isFinite(fdId)) due.push({ matchId, footballDataId: fdId });
    }
    if (due.length === 0) return { checked: ids.length, graded: 0 };

    const matches = await getMatchesByIds(due.map((d) => d.footballDataId));
    const byId = new Map(matches.map((m) => [m.id, m]));

    let graded = 0;
    for (const { matchId, footballDataId } of due) {
        const m = byId.get(footballDataId);
        if (!m || m.status !== 'FINISHED') continue;
        const h = m.score?.fullTime?.home;
        const a = m.score?.fullTime?.away;
        if (h == null || a == null) continue;
        const tracked = await getTracked(matchId);
        if (!tracked) continue;
        await gradePrediction(tracked, h, a);
        await pushRecent(matchId);
        graded++;
    }

    const slips = await gradeSlips(now);

    return { checked: ids.length, due: due.length, graded, ...slips };
}

const finalScore = (m: FDMatch | undefined): { home: number; away: number } | null => {
    const h = m?.score?.fullTime?.home;
    const a = m?.score?.fullTime?.away;
    return m?.status === 'FINISHED' && h != null && a != null ? { home: h, away: a } : null;
};

/** Grade any pending slip whose every leg's match has finished. */
async function gradeSlips(now: number): Promise<{ slipsChecked: number; slipsGraded: number }> {
    const ids = await pendingSlipIds();
    if (ids.length === 0) return { slipsChecked: 0, slipsGraded: 0 };

    let slipsGraded = 0;
    for (const id of ids) {
        const rec = await getSlip(id);
        if (!rec) continue;
        if (rec.legs.some((l) => new Date(l.kickoff).getTime() + 2.5 * 3_600_000 > now)) continue;

        const fdIds = rec.legs.map((l) => Number(l.matchId.split('-')[1])).filter(Number.isFinite);
        const matches = await getMatchesByIds(fdIds);
        const byFdId = new Map(matches.map((m) => [m.id, m]));

        const finals = new Map<string, { home: number; away: number }>();
        let allFinished = true;
        for (const l of rec.legs) {
            const score = finalScore(byFdId.get(Number(l.matchId.split('-')[1])));
            if (!score) {
                allFinished = false;
                break;
            }
            finals.set(l.matchId, score);
        }
        if (!allFinished) continue;

        if (await gradeSlip(rec, finals)) slipsGraded++;
    }
    return { slipsChecked: ids.length, slipsGraded };
}

export async function GET(req: NextRequest) {
    if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    try {
        const summary = await run();
        log.debug('grade cron', summary);
        return NextResponse.json({ ok: true, ...summary });
    } catch (err) {
        log.error('grade cron failed', (err as Error).message);
        return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
    }
}

export const POST = GET;
