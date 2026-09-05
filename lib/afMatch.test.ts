import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    matchFixture,
    nameSim,
    normalizeTeam,
    type AFDayFixture,
    type FixtureQuery,
} from '@/lib/afMatch';

// Real API-Football fixture ids + normalised names for 2026-09-06 (as the live
// feed had them), each with a plausible kickoff. The queries below use the
// Football-Data names that were dropping these fixtures to "core".
function f(
    fixtureId: number,
    leagueId: number,
    hhmm: string,
    homeNorm: string,
    awayNorm: string,
): AFDayFixture {
    return {
        fixtureId,
        homeId: fixtureId * 10,
        awayId: fixtureId * 10 + 1,
        leagueId,
        kickoff: `2026-09-06T${hhmm}:00+00:00`,
        homeNorm,
        awayNorm,
    };
}

const SEP6: AFDayFixture[] = [
    f(1552158, 88, '10:15', 'groningen', 'twente'),
    f(1552159, 88, '12:30', 'heerenveen', 'azalkmaar'),
    f(1552160, 88, '12:30', 'telstar', 'cambuur'),
    f(1552161, 88, '14:45', 'adodenhaag', 'fortunasittard'),
    f(1550111, 135, '13:00', 'frosinone', 'venezia'),
    f(1550115, 135, '13:00', 'parma', 'monza'),
    f(1550108, 135, '16:00', 'bologna', 'sassuolo'),
    f(1550114, 135, '18:45', 'juventus', 'milan'),
    f(1552755, 61, '17:00', 'estactroyes', 'strasbourg'),
    f(1552747, 61, '17:00', 'angers', 'rennes'),
    f(1552751, 61, '18:45', 'marseille', 'paris'),
    f(1557390, 39, '15:00', 'everton', 'manchesterunited'),
    f(1557387, 39, '17:30', 'arsenal', 'chelsea'),
    f(1575152, 78, '15:30', 'eintrachtfrankfurt', 'augsburg'),
    f(1575154, 78, '15:30', 'hamburgersv', 'fsvmainz05'),
    f(1570371, 140, '16:15', 'valencia', 'barcelona'),
];

const q = (
    leagueId: number,
    hhmm: string,
    homeNames: string[],
    awayNames: string[],
): FixtureQuery => ({
    kickoff: `2026-09-06T${hhmm}:00Z`,
    leagueId,
    homeNames,
    awayNames,
});

test('exact names still resolve', () => {
    assert.equal(
        matchFixture(
            q(39, '15:00', ['Everton FC', 'Everton'], ['Manchester United FC', 'Man United']),
            SEP6,
        )?.fixtureId,
        1557390,
    );
    assert.equal(
        matchFixture(q(135, '18:45', ['Juventus FC', 'Juventus'], ['AC Milan', 'Milan']), SEP6)
            ?.fixtureId,
        1550114,
    );
});

test('one-word club vs full name: "AZ" -> "AZ Alkmaar"', () => {
    assert.equal(
        matchFixture(q(88, '12:30', ['SC Heerenveen', 'Heerenveen'], ['AZ']), SEP6)?.fixtureId,
        1552159,
    );
});

test('city vs region: "Stade Rennais" -> "Rennes", "Angers SCO" -> "Angers"', () => {
    assert.equal(
        matchFixture(
            q(61, '17:00', ['Angers SCO'], ['Stade Rennais FC 1901', 'Stade Rennais']),
            SEP6,
        )?.fixtureId,
        1552747,
    );
});

test('sponsor / ordinal noise: "ES Troyes AC", "1. FSV Mainz 05"', () => {
    assert.equal(
        matchFixture(
            q(61, '17:00', ['ES Troyes AC', 'Troyes'], ['RC Strasbourg Alsace', 'Strasbourg']),
            SEP6,
        )?.fixtureId,
        1552755,
    );
    assert.equal(
        matchFixture(q(78, '15:30', ['Hamburger SV', 'HSV'], ['1. FSV Mainz 05', 'Mainz']), SEP6)
            ?.fixtureId,
        1575154,
    );
});

test('wrong competition is rejected', () => {
    assert.equal(matchFixture(q(39, '17:00', ['Angers SCO'], ['Stade Rennais']), SEP6), null);
});

test('a fixture the feed does not carry stays unresolved', () => {
    assert.equal(
        matchFixture(
            q(140, '20:00', ['Elche CF', 'Elche'], ['Real Sociedad de Fútbol', 'Real Sociedad']),
            SEP6,
        ),
        null,
    );
});

test('only one side matching is not enough to attach another fixture', () => {
    // Angers are in the list (v Rennes); asking for Angers v a different side
    // must not return Rennes' — or Marseille's — fixture.
    assert.equal(
        matchFixture(q(61, '17:00', ['Angers SCO'], ['Paris Saint-Germain', 'PSG']), SEP6),
        null,
    );
});

test('missing names', () => {
    assert.equal(matchFixture(q(39, '15:00', [], ['Chelsea']), SEP6), null);
});

test('nameSim behaves', () => {
    assert.equal(nameSim('arsenal', 'arsenal'), 1);
    assert.ok(nameSim('mainz', 'fsvmainz05') >= 0.8);
    const az = nameSim('az', 'azalkmaar');
    assert.ok(az > 0.15 && az < 0.45);
    assert.ok(nameSim('arsenal', 'chelsea') < 0.3);
});

test('normalizeTeam strips a leading ordinal and accents', () => {
    assert.equal(normalizeTeam('1. FSV Mainz 05'), normalizeTeam('FSV Mainz 05'));
    assert.equal(normalizeTeam('Málaga CF'), 'malaga');
    assert.equal(normalizeTeam('Deportivo Alavés'), 'deportivoalaves');
});
