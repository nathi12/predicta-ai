// lib/afMatch.ts
// Pure fixture-identity matching between Football-Data and API-Football.
// No I/O — kept out of services/apiFootball.ts so it stays unit-testable and
// free of the `server-only` / KV imports.
//
// The two providers name clubs differently ("AZ" vs "AZ Alkmaar", "Stade
// Rennais" vs "Rennes", "1. FSV Mainz 05" vs "FSV Mainz 05"). A strict
// normalised-key lookup drops those fixtures to *Core data*; this matcher
// anchors on kickoff time + competition and scores both team names so a naming
// gap on one side no longer loses the enrichment.

/** A resolved API-Football fixture: its id plus both team ids. */
export interface AFFixtureRef {
    fixtureId: number;
    homeId: number;
    awayId: number;
}

/** One API-Football fixture for a given day, team names pre-normalised. */
export interface AFDayFixture extends AFFixtureRef {
    /** API-Football league id, or null when the feed omitted it. */
    leagueId: number | null;
    /** ISO kickoff (UTC), as API-Football reports it. */
    kickoff: string;
    homeNorm: string;
    awayNorm: string;
}

/** The Football-Data side of a fixture we want to resolve. */
export interface FixtureQuery {
    /** ISO kickoff (UTC). */
    kickoff: string;
    /** API-Football league id for the competition, when known. */
    leagueId?: number;
    /** Home name candidates (full name, short name) — raw, un-normalised. */
    homeNames: string[];
    /** Away name candidates. */
    awayNames: string[];
}

const FILLER = /\b(fc|cf|afc|sc|ac|as|ssc|rc|cd|ud|club|calcio|1899|1846|1904|1907|09)\b/g;

/** Lower-case, strip accents / a leading "1." / common filler tokens / punctuation. */
export function normalizeTeam(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/^\s*\d+\.\s*/, '') // "1. FSV Mainz 05" -> "fsv mainz 05"
        .replace(FILLER, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/** Character-bigram Dice coefficient of two strings, 0..1. */
function dice(a: string, b: string): number {
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
    const bigrams = (s: string) => {
        const m = new Map<string, number>();
        for (let i = 0; i < s.length - 1; i++) {
            const g = s.slice(i, i + 2);
            m.set(g, (m.get(g) ?? 0) + 1);
        }
        return m;
    };
    const A = bigrams(a);
    const B = bigrams(b);
    let shared = 0;
    for (const [g, n] of A) shared += Math.min(n, B.get(g) ?? 0);
    return (2 * shared) / (a.length - 1 + (b.length - 1));
}

/** Similarity of two already-normalised club names, 0..1. */
export function nameSim(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    if (short.length >= 4 && long.includes(short)) return 0.85;
    return dice(a, b);
}

function bestSim(cands: string[], target: string): number {
    let best = 0;
    for (const c of cands) {
        best = Math.max(best, nameSim(c, target));
        if (best === 1) break;
    }
    return best;
}

const MINUTE = 60_000;

/**
 * Pick the API-Football fixture that corresponds to `q` from one day's list, or
 * null when nothing matches with enough confidence.
 *
 * A fixture is accepted when either
 *  - both team names match reasonably (handles ordinary spelling differences), or
 *  - one side is a near-exact hit, the kickoff agrees to the minute, and that
 *    near-exact side is unique in the day's list (handles "AZ" ⇄ "AZ Alkmaar"),
 *    or
 *  - one side is strong, the other has real signal, and the kickoff agrees
 *    (handles "Stade Rennais" ⇄ "Rennes").
 */
export function matchFixture(q: FixtureQuery, fixtures: AFDayFixture[]): AFFixtureRef | null {
    const homeNorms = [...new Set(q.homeNames.map(normalizeTeam).filter((s) => s.length >= 2))];
    const awayNorms = [...new Set(q.awayNames.map(normalizeTeam).filter((s) => s.length >= 2))];
    if (homeNorms.length === 0 || awayNorms.length === 0) return null;

    const kickoffMs = Date.parse(q.kickoff);
    const driftMin = (iso: string) => {
        const t = Date.parse(iso);
        return Number.isFinite(t) && Number.isFinite(kickoffMs) ? Math.abs(t - kickoffMs) / MINUTE : 999;
    };

    const scored = fixtures
        .filter((f) => q.leagueId == null || f.leagueId == null || f.leagueId === q.leagueId)
        .map((f) => ({
            f,
            home: bestSim(homeNorms, f.homeNorm),
            away: bestSim(awayNorms, f.awayNorm),
            drift: driftMin(f.kickoff),
        }))
        .filter((c) => c.drift <= 180 && Math.max(c.home, c.away) >= 0.2);

    if (scored.length === 0) return null;
    scored.sort((a, b) => b.home + b.away - (a.home + a.away) || a.drift - b.drift);

    const top = scored[0];
    const hi = Math.max(top.home, top.away);
    const lo = Math.min(top.home, top.away);

    const bothSides = top.home >= 0.6 && top.away >= 0.6 && top.drift <= 90;
    const oneExactSide =
        hi >= 0.9 &&
        lo >= 0.15 &&
        top.drift <= 15 &&
        scored.filter((c) => Math.max(c.home, c.away) >= 0.9 && c.drift <= 15).length === 1;
    const strongPlusWeak = hi >= 0.75 && lo >= 0.3 && top.drift <= 10;

    return bothSides || oneExactSide || strongPlusWeak
        ? { fixtureId: top.f.fixtureId, homeId: top.f.homeId, awayId: top.f.awayId }
        : null;
}
