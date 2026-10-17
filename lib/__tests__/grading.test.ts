import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    emptyRolling,
    foldCorners,
    foldResult,
    gradeResult,
    impliedProbabilities,
    meanScores,
    mergeStats,
} from '@/lib/grading';
import type { FixtureOdds, MarketSnapshot, RollingStats, TrackedPrediction } from '@/types';

const approx = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ~= ${b}`);
const total = (bins: Array<{ n: number }> | undefined) => (bins ?? []).reduce((s, b) => s + b.n, 0);

function tracked(over: Partial<TrackedPrediction> = {}): TrackedPrediction {
    return {
        matchId: 'PL-1',
        league: 'PL',
        kickoff: '2026-10-10T15:00:00Z',
        home: 'Alpha',
        away: 'Beta',
        outcome: { home: 0.5, draw: 0.3, away: 0.2 },
        predictedScore: { home: 1, away: 0 },
        markets: { over15: 0.75, over25: 0.55, over35: 0.3, btts: 0.45, corners95: 0.6, corners105: 0.4 },
        raw: { outcome: { home: 0.55, draw: 0.27, away: 0.18 }, corners95: 0.62, corners105: 0.42 },
        modelVersion: 'test',
        createdAt: '2026-10-09T12:00:00Z',
        ...over,
    };
}

test('gradeResult: hits per market and the 1X2 Brier', () => {
    const r = gradeResult(tracked(), 2, 1);
    // Over 3.5 at 0.3 leaned under, and three goals is under: a hit. BTTS at 0.45
    // leaned no, and both scored: a miss.
    assert.deepEqual(r.hits, { outcome: true, over15: true, over25: true, over35: true, btts: false });
    approx(r.brier1x2, 0.5 ** 2 + 0.3 ** 2 + 0.2 ** 2);
});

test('foldResult: Brier and log loss on the published probabilities, per market', () => {
    const stats = emptyRolling();
    const t = tracked();
    foldResult(stats, t, gradeResult(t, 2, 1)); // home win, 3 goals, both scored

    approx(meanScores(stats.outcome)!.logLoss, -Math.log(0.5));
    approx(meanScores(stats.over25)!.brier, (0.55 - 1) ** 2);
    approx(meanScores(stats.over35)!.logLoss, -Math.log(1 - 0.3));
    approx(meanScores(stats.btts)!.logLoss, -Math.log(0.45));
    assert.equal(stats.btts.hits, 0, 'leaned no, both scored');
    assert.equal(total(stats.calibration), 1, 'published favourite: one point');
    assert.equal(total(stats.rawCalibration?.outcome), 3, 'raw: one-vs-rest');
    assert.equal(stats.byLeague.PL?.n, 1);
    assert.deepEqual(stats.vsMarket, {}, 'no market line, no comparison');
});

test('foldResult: model vs market only on the markets the snapshot priced', () => {
    const stats = emptyRolling();
    const t = tracked();
    const market: MarketSnapshot = {
        outcome: { home: 0.6, draw: 0.25, away: 0.15 },
        over25: 0.6,
        source: 'book',
        bookmaker: 'Bet365',
        fetchedAt: '',
    };
    foldResult(stats, t, gradeResult(t, 0, 0), market); // a 0-0 draw

    const o = stats.vsMarket!.outcome!;
    assert.equal(o.n, 1);
    approx(o.modelLogLoss, -Math.log(0.3));
    approx(o.marketLogLoss, -Math.log(0.25));
    approx(stats.vsMarket!.over25!.marketBrier, 0.6 ** 2);
    assert.equal(stats.vsMarket!.btts, undefined);
});

test('foldResult: a legacy aggregate is upgraded in place — new scores count only new grades', () => {
    const legacy = {
        updatedAt: '2026-01-01T00:00:00Z',
        window: 'all',
        outcome: { n: 40, hits: 20, brier: 24 },
        over15: { n: 40, hits: 30, brier: 0 },
        over25: { n: 40, hits: 22, brier: 0 },
        btts: { n: 40, hits: 21, brier: 0 },
        corners95: { n: 0, hits: 0, brier: 0 },
        corners105: { n: 0, hits: 0, brier: 0 },
        calibration: emptyRolling().calibration,
        cornersCalibration: emptyRolling().cornersCalibration,
        byLeague: {},
    } as RollingStats;
    const t = tracked();
    foldResult(legacy, t, gradeResult(t, 1, 0));

    assert.equal(legacy.outcome.n, 41);
    assert.equal(legacy.outcome.scored, 1);
    assert.equal(legacy.over35?.n, 1);
    assert.ok(Number.isFinite(meanScores(legacy.outcome)!.logLoss));
    approx(legacy.outcome.brier, 24 + gradeResult(t, 1, 0).brier1x2);
});

test('foldCorners: scores the corner lines and fills both calibration bin sets', () => {
    const stats = emptyRolling();
    foldCorners(stats, tracked(), 11);
    assert.equal(stats.corners95.hits, 1, 'leaned over 9.5, 11 corners');
    assert.equal(stats.corners105.hits, 0, 'leaned under 10.5 at 0.4, and 11 is over');
    approx(meanScores(stats.corners95)!.brier, (0.6 - 1) ** 2);
    assert.equal(total(stats.cornersCalibration.over95), 1);
    assert.equal(total(stats.rawCalibration?.over105), 1);

    const none = emptyRolling();
    foldCorners(none, tracked({ markets: { over15: 0.7, over25: 0.5, over35: 0.3, btts: 0.5 } }), 11);
    assert.equal(none.corners95.n, 0, 'no corners lines, nothing folded');
});

test('mergeStats: summing day buckets equals folding into one aggregate', () => {
    const a = tracked({ matchId: 'PL-1' });
    const b = tracked({ matchId: 'PL-2', league: 'SA', outcome: { home: 0.2, draw: 0.3, away: 0.5 } });
    const market: MarketSnapshot = { over25: 0.5, source: 'consensus', bookmaker: null, fetchedAt: '' };

    const day1 = emptyRolling('day');
    const day2 = emptyRolling('day');
    const together = emptyRolling('90d');
    foldResult(day1, a, gradeResult(a, 2, 2), market);
    foldResult(day2, b, gradeResult(b, 0, 1));
    foldResult(together, a, gradeResult(a, 2, 2), market);
    foldResult(together, b, gradeResult(b, 0, 1));
    foldCorners(day2, b, 8);
    foldCorners(together, b, 8);

    const merged = mergeStats('90d', [day1, day2])!;
    const strip = (s: RollingStats) => ({ ...s, updatedAt: '' });
    assert.deepEqual(strip(merged), strip(together));
    assert.equal(mergeStats('90d', []), null);
});

test('impliedProbabilities: removes the margin, and needs both sides of a market', () => {
    const odds: FixtureOdds = {
        fixtureId: 1,
        source: 'book',
        bookmaker: 'Bet365',
        fetchedAt: '2026-10-10T10:00:00Z',
        markets: { home: 2.0, draw: 3.4, away: 3.8, over25: 1.9, under25: 1.9, btts: 1.8 },
    };
    const m = impliedProbabilities(odds)!;
    approx(m.outcome!.home + m.outcome!.draw + m.outcome!.away, 1);
    assert.ok(m.outcome!.home < 1 / 2.0, 'margin removed from the favourite');
    approx(m.over25!, 0.5);
    assert.equal(m.btts, undefined, 'no "no" price, no BTTS line');
    assert.equal(m.bookmaker, 'Bet365');
    assert.equal(impliedProbabilities({ ...odds, markets: { home: 2 } }), null);
});
