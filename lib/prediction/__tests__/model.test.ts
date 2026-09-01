import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    buildScoreMatrix,
    outcomeFromMatrix,
    overProbability,
    bttsProbability,
    poissonPmf,
} from '@/lib/prediction/poisson';
import { eloOutcome, expectedScore, seedFromRecord } from '@/lib/prediction/elo';
import { blendOutcomes } from '@/lib/prediction/ensemble';
import {
    blendedExpectedCorners,
    cornersMarket,
    cornersOverProbability,
    expectedCorners,
    CORNER_RATES_MIN_N,
} from '@/lib/prediction/corners';
import { LEAGUES } from '@/lib/leagues';
import {
    buildCalibrationMap,
    buildCornerCalibrationMap,
    calibrateOutcome,
    CALIBRATION_MIN_TOTAL,
} from '@/lib/prediction/calibrate';
import { predictMatch } from '@/lib/prediction';
import type { EnrichedMatch, RecordSplit, RollingStats, TeamStrength } from '@/types';

const approx = (a: number, b: number, eps = 1e-6) =>
    assert.ok(Math.abs(a - b) < eps, `${a} ~= ${b}`);

test('poisson pmf sums to ~1', () => {
    let s = 0;
    for (let k = 0; k < 40; k++) s += poissonPmf(2.3, k);
    approx(s, 1, 1e-9);
});

test('score matrix sums to ~1 and outcome probs sum to ~1', () => {
    const { matrix } = buildScoreMatrix(1.6, 1.1);
    const total = matrix.flat().reduce((a, b) => a + b, 0);
    approx(total, 1, 1e-9);
    const o = outcomeFromMatrix(matrix);
    approx(o.home + o.draw + o.away, 1, 1e-9);
});

test('over/under ladder is monotonic decreasing', () => {
    const { matrix } = buildScoreMatrix(1.7, 1.4);
    const o05 = overProbability(matrix, 0.5);
    const o15 = overProbability(matrix, 1.5);
    const o25 = overProbability(matrix, 2.5);
    const o35 = overProbability(matrix, 3.5);
    assert.ok(o05 > o15 && o15 > o25 && o25 > o35);
});

test('higher lambdas raise BTTS and the over', () => {
    const low = buildScoreMatrix(0.8, 0.7).matrix;
    const high = buildScoreMatrix(2.1, 1.9).matrix;
    assert.ok(bttsProbability(high) > bttsProbability(low));
    assert.ok(overProbability(high, 2.5) > overProbability(low, 2.5));
});

test('symmetric teams give symmetric-ish 1X2 with a home edge', () => {
    const { matrix } = buildScoreMatrix(1.4, 1.4);
    const o = outcomeFromMatrix(matrix);
    approx(o.home, o.away, 1e-9); // identical lambdas => identical win probs
    const eloEven = eloOutcome(1500, 1500, 65);
    assert.ok(eloEven.home > eloEven.away); // home advantage in Elo
});

test('Dixon-Coles lifts the 1-1 / 0-0 cells vs plain Poisson', () => {
    const dc = buildScoreMatrix(1.3, 1.1, -0.08).matrix;
    const plain = buildScoreMatrix(1.3, 1.1, 0).matrix;
    assert.ok(dc[1][1] > plain[1][1]);
    assert.ok(dc[0][0] > plain[0][0]);
});

test('elo expectedScore is 0.5 at parity without home edge and rises with rating', () => {
    approx(expectedScore(1500, 1500, 0), 0.5, 1e-9);
    assert.ok(expectedScore(1700, 1500, 0) > 0.5);
});

test('seedFromRecord rewards points and goal difference', () => {
    const strong = seedFromRecord(15, 6, 14, 3);
    const weak = seedFromRecord(2, 6, 3, 14);
    assert.ok(strong > 1550 && weak < 1450 && strong > weak);
});

test('blendOutcomes stays normalised and between its inputs', () => {
    const a = { home: 0.6, draw: 0.25, away: 0.15 };
    const b = { home: 0.4, draw: 0.3, away: 0.3 };
    const out = blendOutcomes(a, b);
    approx(out.home + out.draw + out.away, 1, 1e-9);
    assert.ok(out.home < a.home && out.home > b.home);
});

// --- integration ------------------------------------------------------

function split(p: number, w: number, d: number, l: number, gf: number, ga: number): RecordSplit {
    return { played: p, won: w, draw: d, lost: l, goalsFor: gf, goalsAgainst: ga };
}

function team(name: string, elo: number, strong: boolean): TeamStrength {
    const o = strong ? split(10, 7, 2, 1, 22, 9) : split(10, 2, 3, 5, 10, 18);
    return {
        team: { id: name.length, name, shortName: name, tla: name.slice(0, 3).toUpperCase() },
        overall: o,
        home: { ...o, played: 5, goalsFor: o.goalsFor / 2, goalsAgainst: o.goalsAgainst / 2 },
        away: { ...o, played: 5, goalsFor: o.goalsFor / 2, goalsAgainst: o.goalsAgainst / 2 },
        form: strong ? ['W', 'W', 'D', 'W', 'L'] : ['L', 'L', 'D', 'L', 'W'],
        elo,
    };
}

test('predictMatch: strong home team is favourite, output is well-formed', () => {
    const match: EnrichedMatch = {
        id: 'PL-1',
        footballDataId: 1,
        league: 'PL',
        leagueName: 'Premier League',
        kickoff: new Date(Date.now() + 86_400_000).toISOString(),
        home: team('Alpha', 1680, true),
        away: team('Beta', 1440, false),
        dataQuality: 'core',
    };
    const p = predictMatch(match);

    approx(p.outcome.home + p.outcome.draw + p.outcome.away, 1, 0.02);
    assert.ok(p.outcome.home > p.outcome.away);
    assert.ok(p.outcome.home > p.outcome.draw);
    assert.ok(p.confidence >= 20 && p.confidence <= 92);
    assert.ok(p.expectedGoals.home > p.expectedGoals.away);
    assert.ok(p.markets.over15.probability > p.markets.over35.probability);
    assert.ok(p.predictedScore.home >= p.predictedScore.away);
    assert.ok(p.drivers.length > 0);
});

// --- calibration feedback loop --------------------------------------------

/** Build calibration bins from (mean forecast, observed hit rate, sample) rows. */
function calBins(
    rows: Array<{ x: number; hitRate: number; n: number }>,
): RollingStats['calibration'] {
    const bins = Array.from({ length: 10 }, (_, i) => ({ bin: i, predicted: 0, actual: 0, n: 0 }));
    for (const r of rows) {
        const b = bins[Math.min(9, Math.floor(r.x * 10))];
        b.n += r.n;
        b.predicted += r.x * r.n;
        b.actual += r.hitRate * r.n;
    }
    return bins;
}

test('buildCalibrationMap: identity (undefined) until enough games are graded', () => {
    const thin = calBins([{ x: 0.6, hitRate: 0.6, n: CALIBRATION_MIN_TOTAL - 1 }]);
    assert.equal(buildCalibrationMap(thin), undefined);
});

test('buildCalibrationMap: learns a monotonic curve, anchored and identity-below-favourites', () => {
    const map = buildCalibrationMap(
        calBins([
            { x: 0.42, hitRate: 0.4, n: 90 },
            { x: 0.61, hitRate: 0.52, n: 110 },
            { x: 0.78, hitRate: 0.64, n: 70 },
        ]),
    );
    const pts = map?.outcome;
    assert.ok(pts && pts.length >= 4);
    assert.deepEqual(pts[0], { x: 0, y: 0 });
    assert.deepEqual(pts[pts.length - 1], { x: 1, y: 1 });
    for (let i = 1; i < pts.length; i++) {
        assert.ok(pts[i].x >= pts[i - 1].x, 'x non-decreasing');
        assert.ok(pts[i].y >= pts[i - 1].y, 'y non-decreasing');
    }
    // Identity is held from 0 up to just below the favourite range, so
    // non-favourite probabilities are never inflated by a floor.
    const below = pts.find((p) => p.x > 0 && p.x <= 0.3);
    assert.ok(below && Math.abs(below.x - below.y) < 1e-9, 'identity anchor below favourites');
});

test('buildCalibrationMap: an overconfident favourite is pulled toward its real rate', () => {
    const map = buildCalibrationMap(
        calBins([
            { x: 0.4, hitRate: 0.31, n: 120 },
            { x: 0.6, hitRate: 0.5, n: 120 },
            { x: 0.8, hitRate: 0.66, n: 120 },
        ]),
    );
    const before = { home: 0.66, draw: 0.2, away: 0.14 };
    const after = calibrateOutcome(before, map);
    approx(after.home + after.draw + after.away, 1, 1e-9);
    assert.ok(after.home < before.home, 'favourite comes down');
    assert.ok(after.draw > before.draw && after.away > before.away, 'field picks up the slack');
});

test('predictMatch: an active calibration map reshapes the outcome, no map is a no-op', () => {
    const match: EnrichedMatch = {
        id: 'PL-9',
        footballDataId: 9,
        league: 'PL',
        leagueName: 'Premier League',
        kickoff: new Date(Date.now() + 86_400_000).toISOString(),
        home: team('Alpha', 1720, true),
        away: team('Beta', 1400, false),
        dataQuality: 'core',
    };
    const raw = predictMatch(match);
    const map = buildCalibrationMap(
        calBins([
            { x: 0.4, hitRate: 0.3, n: 150 },
            { x: 0.6, hitRate: 0.48, n: 150 },
            { x: 0.8, hitRate: 0.64, n: 150 },
        ]),
    );
    const calibrated = predictMatch(match, { calibration: map });

    approx(
        calibrated.outcome.home + calibrated.outcome.draw + calibrated.outcome.away,
        1,
        0.02,
    );
    assert.ok(calibrated.outcome.home < raw.outcome.home, 'overconfident favourite corrected down');
    // No map => byte-identical to the default call.
    assert.deepEqual(predictMatch(match, { calibration: undefined }).outcome, raw.outcome);
});

// --- corners: proxy vs venue-split team-rate blend ----------------------

const venue = (f: number, a: number, n: number) => ({ for: f, against: a, n });
/** Build a two-sided CornerRates with each team's atHome / atAway split. */
const rates = (
    homeAtHome: ReturnType<typeof venue>,
    homeAtAway: ReturnType<typeof venue>,
    awayAtHome: ReturnType<typeof venue>,
    awayAtAway: ReturnType<typeof venue>,
) => ({
    home: { atHome: homeAtHome, atAway: homeAtAway },
    away: { atHome: awayAtHome, atAway: awayAtAway },
});

test('expectedCorners proxy scales with projected goals, clamped to [6,15]', () => {
    const pl = LEAGUES.PL;
    const busy = expectedCorners(2.2, 1.9, pl);
    const quiet = expectedCorners(0.9, 0.7, pl);
    assert.ok(busy > quiet);
    assert.ok(quiet >= 6 && busy <= 15);
});

test('blendedExpectedCorners: proxy alone until both sides have enough venue games', () => {
    const proxy = 10;
    assert.deepEqual(blendedExpectedCorners(proxy, undefined), { expected: 10, source: 'proxy' });
    // Home side thin *at home* (where it's about to play) — proxy, even though
    // its away sample is deep.
    const thin = rates(
        venue(7, 4, CORNER_RATES_MIN_N - 1),
        venue(7, 4, 12),
        venue(6, 5, 12),
        venue(6, 5, 12),
    );
    assert.equal(blendedExpectedCorners(proxy, thin).source, 'proxy');
});

test('blendedExpectedCorners: a high-corner pairing pulls the total above the proxy', () => {
    const proxy = 9.5;
    const highBoth = rates(
        venue(7.5, 6.5, 12), // home at home
        venue(5, 5, 12),
        venue(5, 5, 12),
        venue(7, 6, 12), // away, away
    );
    const res = blendedExpectedCorners(proxy, highBoth);
    assert.equal(res.source, 'team-rates');
    assert.ok(res.expected > proxy, 'blended estimate exceeds the proxy for two corner-heavy sides');
    assert.ok(res.expected <= 15);
});

test('blendedExpectedCorners: each side is judged on its venue-correct rate', () => {
    const base = rates(venue(6, 5, 10), venue(6, 5, 10), venue(6, 5, 10), venue(6, 5, 10));
    // Bumping the home team's *away* rate must not move the estimate...
    const bumpAway = {
        ...base,
        home: { ...base.home, atAway: venue(15, 0, 10) },
    };
    assert.equal(
        blendedExpectedCorners(10, bumpAway).expected,
        blendedExpectedCorners(10, base).expected,
    );
    // ...but bumping its *home* rate must.
    const bumpHome = {
        ...base,
        home: { ...base.home, atHome: venue(15, 0, 10) },
    };
    assert.ok(
        blendedExpectedCorners(10, bumpHome).expected > blendedExpectedCorners(10, base).expected,
    );
});

test('cornersMarket: team-rates shift the lines and expose the source', () => {
    const pl = LEAGUES.PL;
    const base = cornersMarket(1.6, 1.3, pl);
    assert.equal(base.source, 'proxy');

    const withRates = cornersMarket(
        1.6,
        1.3,
        pl,
        rates(venue(7.5, 6.5, 12), venue(5, 5, 12), venue(5, 5, 12), venue(7.2, 6.1, 12)),
    );
    assert.equal(withRates.source, 'team-rates');
    assert.ok(withRates.over95.probability > base.over95.probability);
    // Ladder stays monotonic.
    assert.ok(withRates.over85.probability > withRates.over95.probability);
    assert.ok(withRates.over95.probability > withRates.over105.probability);
});

test('cornersOverProbability: negative-binomial carries a fatter tail than Poisson', () => {
    const mean = 12;
    const nbTail = cornersOverProbability(mean, 15.5);
    let poissonTail = 0;
    for (let k = 16; k < 80; k++) poissonTail += poissonPmf(mean, k);
    assert.ok(nbTail > poissonTail, 'overdispersion puts more mass in the far tail');
    assert.ok(nbTail > 0 && nbTail < 1);
});

test('cornersMarket: corners calibration curves reshape the traded lines, ladder intact', () => {
    const pl = LEAGUES.PL;
    const raw = cornersMarket(1.6, 1.4, pl);
    // "When the model says ~0.5 over, it really lands ~0.4."
    const down = [
        { x: 0, y: 0 },
        { x: 0.3, y: 0.3 },
        { x: 0.5, y: 0.4 },
        { x: 1, y: 1 },
    ];
    const cal = cornersMarket(1.6, 1.4, pl, undefined, { corners95: down, corners105: down });
    assert.ok(cal.over95.probability < raw.over95.probability, 'over-9.5 pulled down');
    assert.ok(cal.over105.probability < raw.over105.probability, 'over-10.5 pulled down');
    // Ladder stays non-increasing after calibration and without it.
    assert.ok(cal.over85.probability >= cal.over95.probability);
    assert.ok(cal.over95.probability >= cal.over105.probability);
    assert.ok(cal.over105.probability >= cal.over115.probability);
    assert.ok(raw.over85.probability >= raw.over95.probability);
    assert.ok(raw.over95.probability >= raw.over105.probability);
});

test('buildCornerCalibrationMap: identity until enough graded, then a monotonic curve', () => {
    const thin95 = calBins([{ x: 0.6, hitRate: 0.6, n: 50 }]);
    const thin105 = calBins([{ x: 0.5, hitRate: 0.5, n: 50 }]);
    assert.equal(buildCornerCalibrationMap(thin95, thin105), undefined);

    const full95 = calBins([
        { x: 0.45, hitRate: 0.35, n: 80 },
        { x: 0.65, hitRate: 0.5, n: 90 },
    ]);
    const full105 = calBins([
        { x: 0.4, hitRate: 0.3, n: 80 },
        { x: 0.6, hitRate: 0.46, n: 90 },
    ]);
    const map = buildCornerCalibrationMap(full95, full105);
    assert.ok(map?.corners95 && map.corners95.length >= 3);
    assert.ok(map?.corners105);
    for (const pts of [map.corners95, map.corners105]) {
        for (let i = 1; i < pts.length; i++) {
            assert.ok(pts[i].x >= pts[i - 1].x && pts[i].y >= pts[i - 1].y);
        }
    }
});
