import { before, test } from 'node:test';
import assert from 'node:assert/strict';

import { importIsolated } from './isolated';
import { predictMatch } from '@/lib/prediction';
import {
    applyPiecewise,
    CALIBRATION_MIN_TOTAL,
    outcomeCalibrationFromStats,
} from '@/lib/prediction/calibrate';
import type {
    CalibrationBin,
    EnrichedMatch,
    RecordSplit,
    RollingStats,
    TeamStrength,
    TrackedPrediction,
} from '@/types';

type Tracking = typeof import('@/lib/tracking');
let tracking: Tracking;

before(async () => {
    tracking = await importIsolated<Tracking>('lib/tracking.ts');
});

// --- fixtures --------------------------------------------------------------

const split = (p: number, w: number, d: number, l: number, gf: number, ga: number): RecordSplit => ({
    played: p,
    won: w,
    draw: d,
    lost: l,
    goalsFor: gf,
    goalsAgainst: ga,
});

function team(id: number, name: string, elo: number, strong: boolean): TeamStrength {
    const o = strong ? split(10, 7, 2, 1, 22, 9) : split(10, 2, 3, 5, 10, 18);
    const half = { ...o, played: 5, goalsFor: o.goalsFor / 2, goalsAgainst: o.goalsAgainst / 2 };
    return {
        team: { id, name, shortName: name, tla: name.slice(0, 3).toUpperCase() },
        overall: o,
        home: half,
        away: half,
        form: strong ? ['W', 'W', 'D', 'W', 'L'] : ['L', 'L', 'D', 'L', 'W'],
        elo,
    };
}

/** A strong-home-favourite fixture that kicked off three hours ago. */
function fixture(n: number): EnrichedMatch {
    return {
        id: `PL-${n}`,
        footballDataId: n,
        league: 'PL',
        leagueName: 'Premier League',
        kickoff: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        home: team(1, 'Alpha', 1680, true),
        away: team(2, 'Beta', 1440, false),
        dataQuality: 'core',
    };
}

const total = (bins?: CalibrationBin[]) => (bins ?? []).reduce((s, b) => s + b.n, 0);
const stats = async (): Promise<RollingStats | null> => tracking.getRollingStats();
const isPending = async (id: string) => (await tracking.pendingMatchIds()).includes(id);

// --- tests -------------------------------------------------------------------

test('recordPrediction logs the raw probabilities; gradePrediction counts a match exactly once', async () => {
    const match = fixture(1);
    const prediction = predictMatch(match);
    await tracking.recordPrediction(match, prediction);

    const tracked = await tracking.getTracked('PL-1');
    assert.ok(tracked);
    assert.deepEqual(tracked.raw, prediction.raw);
    assert.ok(await isPending('PL-1'));

    const before = await stats();
    const first = await tracking.gradePrediction(tracked, 2, 0);
    assert.ok(first);
    assert.equal(first.hits.outcome, true, 'home favourite, home win');
    assert.equal(
        await tracking.gradePrediction(tracked, 2, 0),
        null,
        'an overlapping run must not grade it again',
    );
    assert.equal(await isPending('PL-1'), false);

    const after = await stats();
    assert.ok(after);
    assert.equal(after.outcome.n - (before?.outcome.n ?? 0), 1);
    assert.equal(total(after.calibration) - total(before?.calibration), 1, 'published favourite: one point');
    assert.equal(
        total(after.rawCalibration?.outcome) - total(before?.rawCalibration?.outcome),
        3,
        'raw one-vs-rest: three points',
    );

    // A graded match is never re-queued by a later slate build.
    await tracking.recordPrediction(match, prediction);
    assert.equal(await isPending('PL-1'), false);
});

test('recentResults returns graded matches with their tracked records', async () => {
    await tracking.pushRecent('PL-1');
    const [latest] = await tracking.recentResults(5);
    assert.equal(latest.matchId, 'PL-1');
    assert.deepEqual(latest.finalScore, { home: 2, away: 0 });
    assert.equal(latest.tracked?.home, 'Alpha');
});

test('calibration round trip: the live curve is learned from raw, not published, probabilities', async () => {
    // Published (already-calibrated) favourite 0.6; the raw model said 0.7.
    // Home lands half the time.
    const base: Omit<TrackedPrediction, 'matchId'> = {
        league: 'SA',
        kickoff: new Date(Date.now() - 86_400_000).toISOString(),
        home: 'Gamma',
        away: 'Delta',
        outcome: { home: 0.6, draw: 0.25, away: 0.15 },
        predictedScore: { home: 1, away: 0 },
        markets: { over15: 0.7, over25: 0.5, over35: 0.3, btts: 0.5 },
        raw: { outcome: { home: 0.7, draw: 0.2, away: 0.1 } },
        modelVersion: 'test',
        createdAt: new Date().toISOString(),
    };
    for (let i = 0; i < CALIBRATION_MIN_TOTAL; i++) {
        const homeWin = i % 2 === 0;
        await tracking.gradePrediction({ ...base, matchId: `SA-${1000 + i}` }, homeWin ? 1 : 0, homeWin ? 0 : 1);
    }

    const s = await stats();
    assert.ok(s);
    const choice = outcomeCalibrationFromStats(s);
    assert.equal(choice.source, 'raw');
    const curve = choice.curves?.outcome;
    assert.ok(curve);
    const near = (x: number) => curve.some((p) => Math.abs(p.x - x) < 0.01);
    assert.ok(near(0.7), 'a point at the raw favourite probability');
    assert.ok(!near(0.6), 'none at the published one');

    const mapped = applyPiecewise(0.7, curve);
    assert.ok(mapped > 0.5 && mapped < 0.6, `raw 0.7 that lands 50% maps down (got ${mapped})`);
});

test('gradeCorners folds raw corner probabilities once, and only after the goals grade', async () => {
    const match = fixture(2);
    await tracking.recordPrediction(match, predictMatch(match));
    const tracked = await tracking.getTracked('PL-2');
    assert.ok(tracked?.raw?.corners95 != null);

    assert.equal(await tracking.gradeCorners('PL-2', 12), false, 'no goals grade yet');

    const before = await stats();
    await tracking.gradePrediction(tracked, 1, 1);
    assert.equal(await tracking.gradeCorners('PL-2', 12), true);
    assert.equal(await tracking.gradeCorners('PL-2', 12), false, 'never double-counted');

    const after = await stats();
    assert.ok(after);
    assert.equal(after.corners95.n - (before?.corners95?.n ?? 0), 1);
    assert.equal(total(after.rawCalibration?.over95) - total(before?.rawCalibration?.over95), 1);
    assert.equal(total(after.rawCalibration?.over105) - total(before?.rawCalibration?.over105), 1);
});

test('a graded match lands in all-time, its model version, and the last-90-days window', async () => {
    const match = fixture(4);
    const prediction = predictMatch(match);
    await tracking.recordPrediction(match, prediction);
    const views = async () =>
        Promise.all([
            tracking.getRollingStats('all'),
            tracking.getRollingStats('model'),
            tracking.getRollingStats('90d'),
        ]);
    const before = await views();
    await tracking.gradePrediction((await tracking.getTracked('PL-4'))!, 3, 1);
    const after = await views();
    for (const [i, view] of ['all', 'model', '90d'].entries()) {
        assert.equal(after[i]!.outcome.n - (before[i]?.outcome.n ?? 0), 1, view);
    }
    assert.equal(after[1]!.modelVersion, prediction.modelVersion);
});

test('the 90-day window leaves out older kickoffs', async () => {
    const old: TrackedPrediction = {
        ...(await tracking.getTracked('PL-4'))!,
        matchId: 'PL-90',
        kickoff: new Date(Date.now() - 120 * 86_400_000).toISOString(),
    };
    const before = await tracking.getRollingStats('90d');
    const allBefore = await tracking.getRollingStats('all');
    await tracking.gradePrediction(old, 0, 0);
    assert.equal((await tracking.getRollingStats('90d'))?.outcome.n, before?.outcome.n);
    assert.equal((await tracking.getRollingStats('all'))!.outcome.n, allBefore!.outcome.n + 1);
});

test('a logged market line is scored against the model when the match is graded', async () => {
    const match = fixture(5);
    await tracking.recordPrediction(match, predictMatch(match));
    const logged = await tracking.recordMarketOdds({
        'PL-5': {
            fixtureId: 5,
            source: 'book',
            bookmaker: 'Bet365',
            fetchedAt: new Date().toISOString(),
            markets: { home: 1.6, draw: 4, away: 5.5, over25: 1.8, under25: 2.0 },
        },
        'PL-6': { fixtureId: 6, source: 'book', bookmaker: 'Bet365', fetchedAt: '', markets: { home: 2 } },
    });
    assert.equal(logged, 1, 'a one-sided quote gives the market no line to log');

    const [market, none] = await tracking.getMarketMany(['PL-5', 'PL-6']);
    assert.ok(market?.outcome && market.over25 != null);
    assert.equal(none, null);

    const before = (await stats())?.vsMarket;
    await tracking.gradePrediction((await tracking.getTracked('PL-5'))!, 2, 0, market);
    const after = (await stats())!.vsMarket!;
    assert.equal(after.outcome!.n - (before?.outcome?.n ?? 0), 1);
    assert.equal(after.over25!.n - (before?.over25?.n ?? 0), 1);
    assert.equal(after.btts?.n ?? 0, before?.btts?.n ?? 0, 'BTTS was not priced');
});

test('discardPending drops an id from the grading queue', async () => {
    const match = fixture(3);
    await tracking.recordPrediction(match, predictMatch(match));
    assert.ok(await isPending('PL-3'));
    await tracking.discardPending('PL-3');
    assert.equal(await isPending('PL-3'), false);
});
