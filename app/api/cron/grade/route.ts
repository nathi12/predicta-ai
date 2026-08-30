// app/api/cron/grade/route.ts
// Grades predictions whose matches have finished. Triggered by Vercel Cron
// (see vercel.json) or manually with the CRON_SECRET.

import { NextResponse, type NextRequest } from 'next/server';
import { CRON_SECRET } from '@/lib/env';
import { log } from '@/lib/log';
import { getMatchesByIds } from '@/services/footballData';
import { gradePrediction, pendingMatchIds, getTracked, pushRecent } from '@/lib/tracking';

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

    return { checked: ids.length, due: due.length, graded };
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
