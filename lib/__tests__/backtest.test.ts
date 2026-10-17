import { test } from 'node:test';
import assert from 'node:assert/strict';

import { replaySeason, predictSnapshot, snapshotElo, type SeasonMatch } from '@/lib/backtest/replay';
import {
    baseRateForecaster,
    fitParams,
    modelForecaster,
    objective,
    score,
    type Fixture,
} from '@/lib/backtest/fit';
import { DEFAULT_PARAMS } from '@/lib/prediction/params';
import { computeLeagueAverages } from '@/lib/prediction/strength';
import { LEAGUES } from '@/lib/leagues';

/**
 * A double round robin (circle method): one round a week, every match in a round
 * kicking off at the same moment. `result` decides each score.
 */
function season(teams: number, result: (home: number, away: number) => [number, number]): SeasonMatch[] {
    const ids = Array.from({ length: teams }, (_, i) => i + 1);
    const rounds: Array<Array<[number, number]>> = [];
    const rot = [...ids];
    for (let r = 0; r < teams - 1; r++) {
        const pairs: Array<[number, number]> = [];
        for (let i = 0; i < teams / 2; i++) pairs.push([rot[i], rot[teams - 1 - i]]);
        rounds.push(pairs);
        rot.splice(1, 0, rot.pop()!);
    }
    const all = [...rounds, ...rounds.map((p) => p.map(([h, a]) => [a, h] as [number, number]))];
    let id = 0;
    return all.flatMap((pairs, r) =>
        pairs.map(([h, a]) => {
            const [hg, ag] = result(h, a);
            return {
                id: ++id,
                utcDate: new Date(Date.UTC(2025, 7, 16 + 7 * r, 15)).toISOString(),
                homeId: h,
                awayId: a,
                homeName: `Team ${h}`,
                awayName: `Team ${a}`,
                homeGoals: hg,
                awayGoals: ag,
            };
        }),
    );
}

/** Stronger (lower-id) side wins 2-1; the home side scores one more than otherwise. */
const ordinary = (h: number, a: number): [number, number] => (h < a ? [2, 1] : [1, 1]);

test('replay: a snapshot only ever sees results from before its own kickoff', () => {
    const matches = season(6, ordinary);
    const { snapshots, results } = replaySeason('PL', matches);
    assert.equal(snapshots.length, matches.length);
    assert.equal(results.length, matches.length);

    for (const s of snapshots) {
        const earlier = matches.filter((m) => m.utcDate < s.match.utcDate);
        assert.equal(s.resultsBefore, earlier.length, `results before match ${s.match.id}`);
        const played = (id: number) => earlier.filter((m) => m.homeId === id || m.awayId === id).length;
        assert.equal(s.home.overall.played, played(s.match.homeId));
        assert.equal(s.away.overall.played, played(s.match.awayId));
    }
});

test('replay: matches kicking off together share one pre-kickoff state', () => {
    const { snapshots } = replaySeason('PL', season(4, ordinary));
    const [a, b] = snapshots.filter((s) => s.match.utcDate === snapshots[2].match.utcDate);
    assert.ok(a && b);
    assert.equal(a.resultsBefore, b.resultsBefore);
    assert.equal(a.seeds, b.seeds);
    assert.equal(a.averages, b.averages);
});

test('replay: the season opener runs on the league prior and level Elo', () => {
    const { snapshots, results } = replaySeason('BL1', season(4, ordinary));
    const [first] = snapshots;
    assert.equal(first.home.overall.played, 0);
    assert.equal(first.resultsBefore, 0);
    assert.ok(first.seeds.every(([, r]) => r === 1500));
    assert.deepEqual(first.averages, computeLeagueAverages([], [], LEAGUES.BL1));
    const replay = { league: 'BL1' as const, results, snapshots };
    assert.deepEqual(snapshotElo(replay, first, DEFAULT_PARAMS), { home: 1500, away: 1500 });
});

test('predictSnapshot: well-formed forecasts, and the forecaster passes them through', () => {
    const replay = replaySeason('PL', season(6, ordinary));
    const last = replay.snapshots[replay.snapshots.length - 1];
    const p = predictSnapshot(last, snapshotElo(replay, last, DEFAULT_PARAMS), DEFAULT_PARAMS);
    assert.ok(Math.abs(p.outcome.home + p.outcome.draw + p.outcome.away - 1) < 0.01);
    assert.equal(p.dataQuality, 'core');
    const f = modelForecaster(DEFAULT_PARAMS)({ replay, snapshot: last });
    assert.deepEqual(f.outcome, p.outcome);
    assert.equal(f.btts, p.markets.btts.probability);
});

test('score: the base-rate forecast scored on its own sample is the sample entropy', () => {
    const replay = replaySeason('PL', season(6, ordinary));
    const fixtures: Fixture[] = replay.snapshots.map((snapshot) => ({ replay, snapshot }));
    const s = score(fixtures, baseRateForecaster(fixtures));
    const n = fixtures.length;
    const freq = [
        fixtures.filter((f) => f.snapshot.match.homeGoals > f.snapshot.match.awayGoals).length / n,
        fixtures.filter((f) => f.snapshot.match.homeGoals === f.snapshot.match.awayGoals).length / n,
    ];
    const entropy = -freq.filter((x) => x > 0).reduce((acc, x) => acc + x * Math.log(x), 0);
    assert.ok(Math.abs(s.logLoss.outcome - entropy) < 1e-9, `${s.logLoss.outcome} vs ${entropy}`);
    assert.equal(s.n, n);
});

test('fitParams: never ends worse than where it started, and only picks grid values', () => {
    const replay = replaySeason('PL', season(6, ordinary));
    const train: Fixture[] = replay.snapshots.map((snapshot) => ({ replay, snapshot }));
    const space = { rho: [-0.1, 0], poissonWeight: [0.3, 0.8] };
    const start = objective(score(train, modelForecaster(DEFAULT_PARAMS)));
    const fit = fitParams(train, DEFAULT_PARAMS, space);
    assert.ok(fit.objective <= start);
    assert.ok([DEFAULT_PARAMS.rho, ...space.rho].includes(fit.params.rho));
    assert.ok([DEFAULT_PARAMS.poissonWeight, ...space.poissonWeight].includes(fit.params.poissonWeight));
    assert.equal(fit.params.eloK, DEFAULT_PARAMS.eloK, 'parameters outside the space are untouched');
});

test('fitParams: finds the home advantage in a league where the home side always wins', () => {
    const replay = replaySeason('PL', season(8, () => [2, 1]));
    const train: Fixture[] = replay.snapshots.map((snapshot) => ({ replay, snapshot }));
    const fit = fitParams(train, { ...DEFAULT_PARAMS, eloHomeAdvantage: 0 }, { eloHomeAdvantage: [0, 60, 120] });
    assert.equal(fit.params.eloHomeAdvantage, 120);
});

test('degenerate league (no away side ever scores) still yields finite forecasts', () => {
    const replay = replaySeason('PL', season(8, () => [2, 0]));
    const fixtures: Fixture[] = replay.snapshots.map((snapshot) => ({ replay, snapshot }));
    const s = score(fixtures, modelForecaster(DEFAULT_PARAMS)); // throws on NaN
    assert.ok(Number.isFinite(objective(s)));
});
