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
import { predictMatch } from '@/lib/prediction';
import type { EnrichedMatch, RecordSplit, TeamStrength } from '@/types';

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
