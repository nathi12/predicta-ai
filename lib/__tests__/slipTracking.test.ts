import { before, test } from 'node:test';
import assert from 'node:assert/strict';

import { importIsolated } from './isolated';
import { SLIP_PRESETS } from '@/lib/slip/types';
import type {
    FixtureOdds,
    MatchWithPrediction,
    RecordSplit,
    SlipLeg,
    SlipRecord,
} from '@/types';

type Slips = typeof import('@/lib/slipTracking');
let slips: Slips;

before(async () => {
    slips = await importIsolated<Slips>('lib/slipTracking.ts');
});

// --- fixtures --------------------------------------------------------------

/** A day no real run will ever log under, so presets logged "today" never collide. */
const PAST_DAY = '2000-01-01';

function leg(matchId: string, market: string, bookOdds: number): SlipLeg {
    return {
        matchId,
        league: 'PL',
        kickoff: '2000-01-01T15:00:00Z',
        home: `${matchId} home`,
        away: `${matchId} away`,
        market,
        pick: market,
        modelProbability: 0.7,
        bookOdds,
        oddsSource: 'book',
    };
}

function record(over: Partial<SlipRecord> = {}): SlipRecord {
    return {
        slipId: `safe-2:${PAST_DAY}`,
        presetId: 'safe-2',
        mode: 'target-odds',
        legs: [leg('PL-1', 'home', 1.5), leg('PL-2', 'over15', 1.3)],
        combinedModelProbability: 0.49,
        combinedFairOdds: 2.04,
        combinedBookOdds: 1.95,
        modelVersion: 'test',
        createdAt: new Date().toISOString(),
        day: PAST_DAY,
        ...over,
    };
}

const finals = (rows: Array<[string, number, number]>) =>
    new Map(rows.map(([id, home, away]) => [id, { home, away }]));

const split: RecordSplit = { played: 10, won: 6, draw: 2, lost: 2, goalsFor: 18, goalsAgainst: 9 };

function upcoming(id: string, hoursAhead: number): MatchWithPrediction {
    const strength = (name: string) => ({
        team: { id: name.length, name, shortName: name, tla: name.slice(0, 3).toUpperCase() },
        overall: split,
        home: split,
        away: split,
        form: ['W', 'W', 'D', 'W', 'L'] as Array<'W' | 'D' | 'L'>,
        elo: 1500,
    });
    const line = (probability: number) => ({ probability, lean: null });
    return {
        match: {
            id,
            footballDataId: Number(id.split('-')[1]),
            league: 'PL',
            leagueName: 'Premier League',
            kickoff: new Date(Date.now() + hoursAhead * 3_600_000).toISOString(),
            home: strength(`${id}H`),
            away: strength(`${id}A`),
            dataQuality: 'core',
        },
        prediction: {
            matchId: id,
            outcome: { home: 0.66, draw: 0.2, away: 0.14 },
            expectedGoals: { home: 1.7, away: 0.9, total: 2.6 },
            predictedScore: { home: 1, away: 0 },
            topScorelines: [],
            markets: {
                over15: line(0.8),
                over25: line(0.6),
                over35: line(0.35),
                btts: line(0.6),
                corners: null,
            },
            confidence: 60,
            dataQuality: 'core',
            drivers: [],
            modelVersion: 'test',
        },
    };
}

const bookPrices = (fixtureId: number): FixtureOdds => ({
    fixtureId,
    source: 'book',
    bookmaker: 'Bet365',
    fetchedAt: '',
    markets: {
        home: 1.5,
        draw: 4,
        away: 6,
        dc1x: 1.15,
        dcx2: 2.5,
        dc12: 1.25,
        over15: 1.25,
        over25: 1.8,
        over35: 3,
        btts: 1.7,
        bttsNo: 2.1,
    },
});

// --- tests -------------------------------------------------------------------

test('legHit: every gradable market against a final score', () => {
    const cases: Array<[string, number, number, boolean]> = [
        ['home', 2, 1, true],
        ['home', 1, 1, false],
        ['away', 0, 1, true],
        ['away', 1, 0, false],
        ['draw', 1, 1, true],
        ['draw', 2, 1, false],
        ['dc1x', 1, 1, true],
        ['dc1x', 0, 1, false],
        ['dcx2', 1, 1, true],
        ['dcx2', 1, 0, false],
        ['dc12', 2, 0, true],
        ['dc12', 0, 0, false],
        ['over15', 1, 1, true],
        ['over15', 1, 0, false],
        ['over25', 2, 1, true],
        ['over25', 1, 1, false],
        ['over35', 3, 1, true],
        ['over35', 2, 1, false],
        ['btts', 1, 1, true],
        ['btts', 2, 0, false],
        ['corners95', 5, 5, false],
    ];
    for (const [market, h, a, want] of cases) {
        assert.equal(slips.legHit(market, h, a), want, `${market} ${h}-${a}`);
    }
});

test('a book-priced slip is logged once per preset per day and settled once, at its book odds', async () => {
    const rec = record();
    assert.equal(await slips.recordSlip(rec), true);
    assert.equal(
        await slips.recordSlip({ ...rec, legs: [leg('PL-9', 'btts', 1.7), leg('PL-8', 'home', 2)] }),
        false,
        'one slip per preset per day',
    );
    assert.ok((await slips.pendingSlipIds()).includes(rec.slipId));

    const score = finals([
        ['PL-1', 2, 0],
        ['PL-2', 1, 1],
    ]);
    const graded = await slips.gradeSlip(rec, score);
    assert.ok(graded);
    assert.equal(graded.won, true);
    assert.equal(graded.payoutMultiple, 1.95);
    assert.equal(await slips.gradeSlip(rec, score), null, 'never settled twice');
    assert.equal((await slips.pendingSlipIds()).includes(rec.slipId), false);

    const stats = await slips.getSlipStats();
    assert.equal(stats?.overall.n, 1);
    assert.equal(stats?.overall.returned, 1.95);
});

test('legacy per-view and fair-priced records are dropped, never settled', async () => {
    const before = (await slips.getSlipStats())?.overall.n ?? 0;
    const score = finals([
        ['PL-1', 2, 0],
        ['PL-2', 1, 1],
    ]);
    const legacy = record({ slipId: 'safe-2:3f9a0c1d2e4b', day: undefined });
    const fair = record({ slipId: `btts-3:${PAST_DAY}`, presetId: 'btts-3', combinedBookOdds: null });
    for (const r of [legacy, fair]) {
        assert.equal(await slips.gradeSlip(r, score), null, r.slipId);
    }
    assert.equal((await slips.getSlipStats())?.overall.n ?? 0, before);
});

test('recentSlips returns settled slips with team names and scores on every leg', async () => {
    const [latest] = await slips.recentSlips(5);
    assert.equal(latest.slipId, `safe-2:${PAST_DAY}`);
    assert.deepEqual(
        latest.legResults.map((l) => [l.home, l.score]),
        [
            ['PL-1 home', { home: 2, away: 0 }],
            ['PL-2 home', { home: 1, away: 1 }],
        ],
    );
});

test('recordPresetSlips logs each preset once a day, from book-priced selections only', async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const matches = [1, 2, 3, 4, 5].map((n) => upcoming(`PL-${100 + n}`, 6 + 12 * n));
    // Live prices for the first four fixtures only.
    const odds = Object.fromEntries(matches.slice(0, 4).map((m, i) => [m.match.id, bookPrices(i + 1)]));

    assert.equal(await slips.recordPresetSlips(matches, {}, now), 0, 'no live prices, nothing logged');
    assert.equal(await slips.recordPresetSlips(matches, odds, now), SLIP_PRESETS.length);

    for (const preset of SLIP_PRESETS) {
        const rec = await slips.getSlip(`${preset.id}:${day}`);
        assert.ok(rec, preset.id);
        assert.ok(rec.combinedBookOdds != null, `${preset.id} has a real price`);
        for (const l of rec.legs) {
            assert.ok(l.bookOdds != null, `${preset.id} ${l.matchId} priced`);
            assert.notEqual(l.matchId, 'PL-105', 'an unpriced fixture is never a leg');
        }
    }

    assert.equal(await slips.recordPresetSlips(matches, odds, now), 0, 'a re-run the same day is a no-op');
});
