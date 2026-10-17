import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { MatchWithPrediction, RecordSplit } from '@/types';
import { toFixtureSummary, type FixtureSummary } from '@/lib/fixtures/summary';
import {
    DEFAULT_FILTERS,
    dayKey,
    dayLabel,
    dayOffset,
    focusColumn,
    groupByDay,
    inBucket,
    probBand,
    selectFixtures,
} from '@/lib/fixtures/view';

const split: RecordSplit = { played: 8, won: 4, draw: 2, lost: 2, goalsFor: 12, goalsAgainst: 9 };

function makeMatch(id: string, kickoff: string, corners = true): MatchWithPrediction {
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
            id,
            footballDataId: 1,
            league: 'PL',
            leagueName: 'Premier League',
            kickoff,
            home: strength('Home'),
            away: strength('Away'),
            dataQuality: 'core',
        },
        prediction: {
            matchId: id,
            outcome: { home: 0.5, draw: 0.27, away: 0.23 },
            expectedGoals: { home: 1.6, away: 1.1, total: 2.7 },
            predictedScore: { home: 1, away: 1 },
            topScorelines: [{ home: 1, away: 1, probability: 0.12 }],
            markets: {
                over15: line(0.78),
                over25: line(0.55),
                over35: line(0.3),
                btts: line(0.52),
                corners: corners
                    ? {
                          over85: line(0.7),
                          over95: line(0.58),
                          over105: line(0.44),
                          over115: line(0.3),
                          expected: 10.1,
                          source: 'proxy',
                      }
                    : null,
            },
            confidence: 61,
            dataQuality: 'core',
            drivers: ['Teams are closely rated — a tight contest on paper.'],
            modelVersion: '2.5.0',
        },
    };
}

function summary(id: string, kickoff: string, patch: Partial<FixtureSummary> = {}): FixtureSummary {
    return { ...toFixtureSummary(makeMatch(id, kickoff)), ...patch };
}

test('probBand follows the rounded percentage at each edge', () => {
    assert.equal(probBand(0.344), 1);
    assert.equal(probBand(0.345), 2); // shows as 35%
    assert.equal(probBand(0.35), 2);
    assert.equal(probBand(0.494), 2);
    assert.equal(probBand(0.5), 3);
    assert.equal(probBand(0.644), 3);
    assert.equal(probBand(0.645), 4); // shows as 65%
    assert.equal(probBand(0.65), 4);
    assert.equal(probBand(0.95), 4);
});

test('a 23:30Z kickoff lands on different days per time zone', () => {
    const iso = '2026-10-18T23:30:00Z';
    assert.equal(dayKey(iso, 'UTC'), '2026-10-18');
    assert.equal(dayKey(iso, 'America/New_York'), '2026-10-18');
    assert.equal(dayKey(iso, 'Asia/Tokyo'), '2026-10-19');
});

test('groupByDay splits consecutive fixtures by local day, keeping order', () => {
    const rows = [
        { kickoff: '2026-10-18T14:00:00Z' },
        { kickoff: '2026-10-18T23:30:00Z' },
        { kickoff: '2026-10-19T12:00:00Z' },
    ];
    assert.deepEqual(
        groupByDay(rows, 'UTC').map((g) => [g.key, g.rows.length]),
        [
            ['2026-10-18', 2],
            ['2026-10-19', 1],
        ],
    );
    assert.deepEqual(
        groupByDay(rows, 'Asia/Tokyo').map((g) => [g.key, g.rows.length]),
        [
            ['2026-10-18', 1],
            ['2026-10-19', 2],
        ],
    );
});

test('dayOffset and buckets count calendar days, not 24h windows', () => {
    // 00:30 tomorrow is one calendar day ahead even though it is <24h away.
    assert.equal(dayOffset('2026-10-19T00:30:00Z', 'UTC', '2026-10-18'), 1);
    assert.equal(dayOffset('2026-10-18T23:59:00Z', 'UTC', '2026-10-18'), 0);
    // Across a month end.
    assert.equal(dayOffset('2026-11-01T10:00:00Z', 'UTC', '2026-10-31'), 1);

    assert.equal(inBucket(0, 'today'), true);
    assert.equal(inBucket(1, 'today'), false);
    assert.equal(inBucket(1, 'tomorrow'), true);
    assert.equal(inBucket(2, '3d'), true);
    assert.equal(inBucket(3, '3d'), false);
    assert.equal(inBucket(6, 'week'), true);
    assert.equal(inBucket(7, 'week'), false);
    // Unknown day (server render): nothing is filtered out.
    assert.equal(inBucket(null, 'today'), true);
});

test('dayLabel adds Today/Tomorrow only once the viewer day is known', () => {
    assert.deepEqual(dayLabel('2026-10-18', null), { relative: null, date: 'Sun 18 Oct' });
    assert.equal(dayLabel('2026-10-18', '2026-10-18').relative, 'Today');
    assert.equal(dayLabel('2026-10-19', '2026-10-18').relative, 'Tomorrow');
    assert.equal(dayLabel('2026-10-20', '2026-10-18').relative, null);
});

test('selectFixtures filters, then sorts by kickoff or ranks descending', () => {
    const a = summary('PL-1', '2026-10-18T14:00:00Z', {
        markets: { ...summary('x', '2026-10-18T14:00:00Z').markets, over25: 0.4, corners95: null },
    });
    const b = summary('PL-2', '2026-10-18T12:00:00Z', { dataQuality: 'enriched', confidence: 80 });
    const c = summary('SA-3', '2026-10-20T18:00:00Z', { league: 'SA', leagueName: 'Serie A' });

    const ids = (xs: FixtureSummary[]) => xs.map((x) => x.id);

    assert.deepEqual(ids(selectFixtures([a, b, c], DEFAULT_FILTERS, 'UTC', null)), ['PL-2', 'PL-1', 'SA-3']);
    assert.deepEqual(
        ids(selectFixtures([a, b, c], { ...DEFAULT_FILTERS, date: 'today' }, 'UTC', '2026-10-18')),
        ['PL-2', 'PL-1'],
    );
    assert.deepEqual(
        ids(selectFixtures([a, b, c], { ...DEFAULT_FILTERS, league: 'SA' }, 'UTC', null)),
        ['SA-3'],
    );
    assert.deepEqual(
        ids(selectFixtures([a, b, c], { ...DEFAULT_FILTERS, enrichedOnly: true }, 'UTC', null)),
        ['PL-2'],
    );
    // Ties on probability fall back to kickoff order.
    assert.deepEqual(
        ids(selectFixtures([a, b, c], { ...DEFAULT_FILTERS, sort: 'over25' }, 'UTC', null)),
        ['PL-2', 'SA-3', 'PL-1'],
    );
    // An unmodelled corners line ranks last.
    assert.deepEqual(
        ids(selectFixtures([a, b, c], { ...DEFAULT_FILTERS, sort: 'corners95' }, 'UTC', null)),
        ['PL-2', 'SA-3', 'PL-1'],
    );
    assert.deepEqual(
        ids(selectFixtures([a, b, c], { ...DEFAULT_FILTERS, sort: 'confidence' }, 'UTC', null)),
        ['PL-2', 'PL-1', 'SA-3'],
    );
});

test('focusColumn reuses existing columns and adds one for the rest', () => {
    assert.equal(focusColumn('kickoff'), null);
    assert.equal(focusColumn('over25'), 'o25');
    assert.equal(focusColumn('btts'), 'btts');
    assert.equal(focusColumn('confidence'), 'conf');
    assert.equal(focusColumn('corners105'), 'extra');
});

test('toFixtureSummary keeps the list fields and drops the heavy ones', () => {
    const s = toFixtureSummary(makeMatch('PL-9', '2026-10-18T14:00:00Z', false));
    assert.equal(s.home.name, 'Home');
    assert.equal(s.markets.over25, 0.55);
    assert.equal(s.markets.corners95, null);
    assert.equal(s.confidence, 61);
    assert.equal('form' in s.home, false);
    assert.equal('drivers' in s, false);
    assert.equal('topScorelines' in s, false);
    assert.equal('crest' in s.home, false);
});
