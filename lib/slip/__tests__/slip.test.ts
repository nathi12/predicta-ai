import { test } from 'node:test';
import assert from 'node:assert/strict';

import type {
    DataQuality,
    FixtureOdds,
    LeagueCode,
    MatchWithPrediction,
    RecordSplit,
} from '@/types';
import { enumerateSelections } from '@/lib/slip/selections';
import { buildSlip } from '@/lib/slip/build';
import { DEFAULT_REQUEST, type SlipRequest } from '@/lib/slip/types';

// --- fixtures --------------------------------------------------------------

const DAY = 86_400_000;
const split: RecordSplit = { played: 10, won: 5, draw: 3, lost: 2, goalsFor: 15, goalsAgainst: 10 };

interface MatchOpts {
    id: string;
    league?: LeagueCode;
    daysAhead?: number;
    outcome?: { home: number; draw: number; away: number };
    over15?: number;
    over25?: number;
    over35?: number;
    btts?: number;
    corners?: boolean;
    dataQuality?: DataQuality;
    confidence?: number;
}

function makeMatch(o: MatchOpts): MatchWithPrediction {
    const outcome = o.outcome ?? { home: 0.45, draw: 0.28, away: 0.27 };
    const strength = (name: string) => ({
        team: { id: name.length, name, shortName: name, tla: name.slice(0, 3).toUpperCase() },
        overall: split,
        home: split,
        away: split,
        form: ['W', 'D', 'L', 'W', 'W'] as Array<'W' | 'D' | 'L'>,
        elo: 1500,
    });
    const line = (probability: number) => ({ probability, lean: null });
    return {
        match: {
            id: o.id,
            footballDataId: Number(o.id.split('-')[1] ?? 0),
            league: o.league ?? 'PL',
            leagueName: 'Premier League',
            kickoff: new Date(Date.now() + (o.daysAhead ?? 2) * DAY).toISOString(),
            home: strength(`${o.id}H`),
            away: strength(`${o.id}A`),
            dataQuality: o.dataQuality ?? 'core',
        },
        prediction: {
            matchId: o.id,
            outcome,
            expectedGoals: { home: 1.5, away: 1.1, total: 2.6 },
            predictedScore: { home: 1, away: 1 },
            topScorelines: [],
            markets: {
                over15: line(o.over15 ?? 0.8),
                over25: line(o.over25 ?? 0.55),
                over35: line(o.over35 ?? 0.3),
                btts: line(o.btts ?? 0.55),
                corners: o.corners
                    ? {
                          over85: line(0.7),
                          over95: line(0.55),
                          over105: line(0.4),
                          over115: line(0.28),
                          expected: 10.2,
                          source: 'proxy' as const,
                      }
                    : null,
            },
            confidence: o.confidence ?? 60,
            dataQuality: o.dataQuality ?? 'core',
            drivers: [`${o.id} driver`],
            modelVersion: 'test',
        },
    };
}

const req = (over: Partial<SlipRequest> = {}): SlipRequest => ({ ...DEFAULT_REQUEST, ...over });

// --- enumerateSelections -------------------------------------------------

test('enumerateSelections: probabilities, fair odds and double chance', () => {
    const m = makeMatch({ id: 'PL-1', outcome: { home: 0.7, draw: 0.2, away: 0.1 }, over15: 0.83 });
    const sel = enumerateSelections([m], {}, req({ risk: 'balanced', minProbability: 0.55 }));

    const home = sel.find((s) => s.market === 'home');
    assert.ok(home);
    assert.equal(home!.modelProbability, 0.7);
    assert.ok(Math.abs(home!.fairOdds - 1 / 0.7) < 1e-9);
    assert.equal(home!.oddsSource, 'model');
    assert.equal(home!.edge, null);

    const dc1x = sel.find((s) => s.market === 'dc1x');
    assert.ok(dc1x);
    assert.ok(Math.abs(dc1x!.modelProbability - 0.9) < 1e-9);

    // away (0.1) and draw are below the floor / never auto-picked
    assert.equal(
        sel.some((s) => s.market === 'away' || s.market === 'draw'),
        false,
    );
});

test('enumerateSelections: edge sign follows book odds', () => {
    const m = makeMatch({ id: 'PL-1', outcome: { home: 0.7, draw: 0.2, away: 0.1 } });
    const value: Record<string, FixtureOdds> = {
        'PL-1': {
            fixtureId: 1,
            source: 'book',
            bookmaker: 'Betway',
            fetchedAt: '',
            markets: { home: 1.6 },
        },
    };
    const good = enumerateSelections([m], value, req()).find((s) => s.market === 'home');
    assert.ok(good && good.edge != null && good.edge > 0); // 0.7 * 1.6 - 1 = 0.12
    assert.equal(good!.oddsSource, 'book');

    value['PL-1'].markets.home = 1.3;
    const bad = enumerateSelections([m], value, req()).find((s) => s.market === 'home');
    assert.ok(bad && bad.edge != null && bad.edge < 0); // 0.7 * 1.3 - 1 = -0.09
});

test('enumerateSelections: league and date-window filters', () => {
    const inWeek = makeMatch({ id: 'PL-1', daysAhead: 3 });
    const nextWeek = makeMatch({ id: 'PL-2', daysAhead: 20 });
    const past = makeMatch({ id: 'PL-3', daysAhead: -1 });
    const laliga = makeMatch({ id: 'PD-9', league: 'PD', daysAhead: 3 });

    const all = enumerateSelections([inWeek, nextWeek, past, laliga], {}, req());
    assert.deepEqual([...new Set(all.map((s) => s.matchId))].sort(), ['PD-9', 'PL-1']);

    const plOnly = enumerateSelections([inWeek, laliga], {}, req({ leagues: ['PL'] }));
    assert.deepEqual([...new Set(plOnly.map((s) => s.matchId))], ['PL-1']);
});

test('enumerateSelections: safe preset excludes over 3.5 and corners', () => {
    const m = makeMatch({ id: 'PL-1', over35: 0.9, corners: true });
    const markets = new Set(
        enumerateSelections([m], {}, req({ risk: 'safe', minProbability: 0.5 })).map((s) => s.market),
    );
    assert.equal(markets.has('over35'), false);
    assert.equal(markets.has('corners95'), false);
});

// --- single-market mode ------------------------------------------------

test('single-market: top-N by probability, one per match, kickoff-ordered', () => {
    const matches = [
        makeMatch({ id: 'PL-1', over15: 0.7, daysAhead: 5 }),
        makeMatch({ id: 'PL-2', over15: 0.9, daysAhead: 2 }),
        makeMatch({ id: 'PL-3', over15: 0.85, daysAhead: 3 }),
        makeMatch({ id: 'PL-4', over15: 0.6, daysAhead: 1 }),
    ];
    const r = req({ mode: 'single-market', market: 'over15', legs: 3, minProbability: 0.5 });
    const sel = enumerateSelections(matches, {}, r, { onlyMarket: 'over15' });
    const slip = buildSlip(sel, r);

    assert.equal(slip.legs.length, 3);
    assert.deepEqual(
        slip.legs.map((l) => l.matchId),
        ['PL-2', 'PL-3', 'PL-1'].sort((a, b) => {
            const ka = matches.find((m) => m.match.id === a)!.match.kickoff;
            const kb = matches.find((m) => m.match.id === b)!.match.kickoff;
            return ka.localeCompare(kb);
        }),
    );
    assert.equal(new Set(slip.legs.map((l) => l.matchId)).size, 3);
    assert.ok(slip.legs.every((l) => l.market === 'over15'));
});

// --- target-odds mode ------------------------------------------------

function targetReq(over: Partial<SlipRequest>): SlipRequest {
    return req({ mode: 'target-odds', risk: 'balanced', minProbability: 0.5, maxLegs: 6, ...over });
}

const distinctMatches = (ids: string[]) => new Set(ids).size === ids.length;

test('target-odds: reaches the target, one leg per match, within the leg cap', () => {
    const matches = [
        makeMatch({ id: 'PL-1', outcome: { home: 0.66, draw: 0.2, away: 0.14 }, daysAhead: 1 }),
        makeMatch({ id: 'PL-2', outcome: { home: 0.62, draw: 0.22, away: 0.16 }, daysAhead: 2 }),
        makeMatch({ id: 'PL-3', outcome: { home: 0.58, draw: 0.24, away: 0.18 }, daysAhead: 3 }),
        makeMatch({ id: 'PL-4', outcome: { home: 0.55, draw: 0.24, away: 0.21 }, daysAhead: 4 }),
        makeMatch({ id: 'PL-5', outcome: { home: 0.52, draw: 0.25, away: 0.23 }, daysAhead: 5 }),
    ];
    const r = targetReq({ targetOdds: 3.0, maxLegs: 4 });
    const slip = buildSlip(enumerateSelections(matches, {}, r), r);

    assert.ok(slip.combinedEffectiveOdds >= 3.0);
    assert.ok(slip.legs.length >= 2 && slip.legs.length <= 4);
    assert.ok(distinctMatches(slip.legs.map((l) => l.matchId)));
    assert.equal(slip.warnings.some((w) => w.includes("Couldn't reach")), false);
});

test('target-odds: a smaller target produces a shorter, higher-probability slip', () => {
    const matches = [
        makeMatch({ id: 'PL-1', outcome: { home: 0.66, draw: 0.2, away: 0.14 }, daysAhead: 1 }),
        makeMatch({ id: 'PL-2', outcome: { home: 0.62, draw: 0.22, away: 0.16 }, daysAhead: 2 }),
        makeMatch({ id: 'PL-3', outcome: { home: 0.58, draw: 0.24, away: 0.18 }, daysAhead: 3 }),
        makeMatch({ id: 'PL-4', outcome: { home: 0.55, draw: 0.24, away: 0.21 }, daysAhead: 4 }),
    ];
    const small = buildSlip(
        enumerateSelections(matches, {}, targetReq({ targetOdds: 1.8 })),
        targetReq({ targetOdds: 1.8 }),
    );
    const big = buildSlip(
        enumerateSelections(matches, {}, targetReq({ targetOdds: 6 })),
        targetReq({ targetOdds: 6 }),
    );

    assert.ok(small.combinedEffectiveOdds >= 1.8);
    assert.ok(small.legs.length <= big.legs.length);
    assert.ok(small.combinedModelProbability >= big.combinedModelProbability);
});

test('target-odds: unreachable target returns closest combo with a warning', () => {
    const matches = [
        makeMatch({ id: 'PL-1', outcome: { home: 0.9, draw: 0.06, away: 0.04 }, daysAhead: 1 }),
        makeMatch({ id: 'PL-2', outcome: { home: 0.88, draw: 0.07, away: 0.05 }, daysAhead: 2 }),
    ];
    const r = targetReq({ targetOdds: 5.0, maxLegs: 4 });
    const slip = buildSlip(enumerateSelections(matches, {}, r), r);
    assert.equal(slip.legs.length, 2);
    assert.ok(slip.combinedEffectiveOdds < 5.0);
    assert.ok(slip.warnings.some((w) => w.includes("Couldn't reach")));
});

test('buildSlip: no fixtures yields an empty, warned slip and never throws', () => {
    const r = targetReq({ targetOdds: 2.0 });
    const slip = buildSlip([], r);
    assert.equal(slip.legs.length, 0);
    assert.equal(slip.combinedModelProbability, 1);
    assert.ok(slip.warnings.length > 0);
});

test('combined edge is computed only when every leg has book odds', () => {
    const matches = [
        makeMatch({ id: 'PL-1', over15: 0.82, daysAhead: 1 }),
        makeMatch({ id: 'PL-2', over15: 0.78, daysAhead: 2 }),
    ];
    const odds: Record<string, FixtureOdds> = {
        'PL-1': { fixtureId: 1, source: 'book', bookmaker: 'Betway', fetchedAt: '', markets: { over15: 1.22 } },
        'PL-2': { fixtureId: 2, source: 'book', bookmaker: 'Betway', fetchedAt: '', markets: { over15: 1.28 } },
    };
    const r = req({ mode: 'single-market', market: 'over15', legs: 2, minProbability: 0.5 });
    const opts = { onlyMarket: 'over15' as const };

    const withOdds = buildSlip(enumerateSelections(matches, odds, r, opts), r);
    assert.equal(withOdds.legs.length, 2);
    assert.ok(withOdds.combinedBookOdds != null);
    assert.ok(withOdds.combinedEdge != null);

    const partial = buildSlip(enumerateSelections(matches, { 'PL-1': odds['PL-1'] }, r, opts), r);
    assert.equal(partial.combinedBookOdds, null);
    assert.equal(partial.combinedEdge, null);
});
