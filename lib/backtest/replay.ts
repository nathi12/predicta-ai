// lib/backtest/replay.ts
// Rebuild what the live model would have known before each finished match of a
// season — home/away/total tables, recent form, standings-seeded Elo, league
// averages — straight from that season's results, so a past season can be
// predicted the way lib/matchData.ts would have and scored against what
// actually happened. Pure; no I/O.
//
// Not replayed: head-to-head and API-Football enrichment (no history for
// either), so every replayed fixture runs on *core* data.

import type { EnrichedMatch, LeagueCode, MatchPrediction, RecordSplit, TeamStrength } from '@/types';
import { LEAGUES } from '@/lib/leagues';
import { predictMatch } from '@/lib/prediction';
import { buildRatings, seedFromRecord, type FinishedResult } from '@/lib/prediction/elo';
import type { ModelParams } from '@/lib/prediction/params';
import {
    computeLeagueAverages,
    halfOf,
    type LeagueAverages,
} from '@/lib/prediction/strength';

/** One finished league match, as the backtest stores it. */
export interface SeasonMatch {
    id: number;
    utcDate: string;
    homeId: number;
    awayId: number;
    homeName: string;
    awayName: string;
    homeGoals: number;
    awayGoals: number;
}

type Side = Omit<TeamStrength, 'elo'>;

/** The state of the league just before one match kicked off. */
export interface Snapshot {
    league: LeagueCode;
    match: SeasonMatch;
    home: Side;
    away: Side;
    averages: LeagueAverages;
    /** Standings-derived Elo seeds at kickoff, [teamId, rating]. */
    seeds: Array<[number, number]>;
    /** How many of the season's results (chronological) were in before kickoff. */
    resultsBefore: number;
}

export interface SeasonReplay {
    league: LeagueCode;
    /** Every result, chronological — the Elo replay reads a prefix of it. */
    results: FinishedResult[];
    snapshots: Snapshot[];
}

const empty = (): RecordSplit => ({ played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });
const points = (r: RecordSplit) => 3 * r.won + r.draw;

function add(r: RecordSplit, gf: number, ga: number): void {
    r.played += 1;
    r.goalsFor += gf;
    r.goalsAgainst += ga;
    if (gf > ga) r.won += 1;
    else if (gf === ga) r.draw += 1;
    else r.lost += 1;
}

export function replaySeason(league: LeagueCode, matches: SeasonMatch[]): SeasonReplay {
    const cfg = LEAGUES[league];
    const ordered = [...matches].sort((a, b) => a.utcDate.localeCompare(b.utcDate) || a.id - b.id);

    const names = new Map<number, string>();
    const total = new Map<number, RecordSplit>();
    const atHome = new Map<number, RecordSplit>();
    const atAway = new Map<number, RecordSplit>();
    const form = new Map<number, Array<'W' | 'D' | 'L'>>();
    for (const m of ordered) {
        for (const [id, name] of [
            [m.homeId, m.homeName],
            [m.awayId, m.awayName],
        ] as const) {
            if (names.has(id)) continue;
            names.set(id, name);
            total.set(id, empty());
            atHome.set(id, empty());
            atAway.set(id, empty());
            form.set(id, []);
        }
    }

    // Mirrors lib/matchData.ts buildLeague: venue split falls back to half the
    // overall record until a side has played at that venue.
    const side = (id: number): Side => {
        const overall = { ...total.get(id)! };
        const home = { ...atHome.get(id)! };
        const away = { ...atAway.get(id)! };
        const name = names.get(id)!;
        return {
            team: { id, name, shortName: name, tla: name.slice(0, 3).toUpperCase() },
            overall,
            home: home.played > 0 ? home : halfOf(overall),
            away: away.played > 0 ? away : halfOf(overall),
            form: form.get(id)!.slice(0, 5),
        };
    };

    const results: FinishedResult[] = [];
    const snapshots: Snapshot[] = [];

    for (let i = 0; i < ordered.length; ) {
        // Matches kicking off at the same moment share one pre-kickoff state.
        let j = i;
        while (j < ordered.length && ordered[j].utcDate === ordered[i].utcDate) j++;
        const group = ordered.slice(i, j);

        const averages = computeLeagueAverages([...atHome.values()], [...atAway.values()], cfg);
        const seeds: Array<[number, number]> = [...total.entries()].map(([id, r]) => [
            id,
            seedFromRecord(points(r), r.played, r.goalsFor, r.goalsAgainst),
        ]);
        for (const m of group) {
            snapshots.push({
                league,
                match: m,
                home: side(m.homeId),
                away: side(m.awayId),
                averages,
                seeds,
                resultsBefore: results.length,
            });
        }

        for (const m of group) {
            add(total.get(m.homeId)!, m.homeGoals, m.awayGoals);
            add(total.get(m.awayId)!, m.awayGoals, m.homeGoals);
            add(atHome.get(m.homeId)!, m.homeGoals, m.awayGoals);
            add(atAway.get(m.awayId)!, m.awayGoals, m.homeGoals);
            const r = (gf: number, ga: number) => (gf > ga ? 'W' : gf === ga ? 'D' : 'L');
            form.get(m.homeId)!.unshift(r(m.homeGoals, m.awayGoals));
            form.get(m.awayId)!.unshift(r(m.awayGoals, m.homeGoals));
            results.push({
                homeId: m.homeId,
                awayId: m.awayId,
                homeGoals: m.homeGoals,
                awayGoals: m.awayGoals,
                kickoff: m.utcDate,
            });
        }
        i = j;
    }

    return { league, results, snapshots };
}

/** Both sides' Elo at kickoff under `params` — seeded from the table, refined by the results so far. */
export function snapshotElo(
    replay: SeasonReplay,
    s: Snapshot,
    params: Pick<ModelParams, 'eloK' | 'eloHomeAdvantage'>,
): { home: number; away: number } {
    const ratings = buildRatings(new Map(s.seeds), replay.results.slice(0, s.resultsBefore), {
        k: params.eloK,
        homeAdvantage: params.eloHomeAdvantage,
    });
    return { home: ratings.get(s.match.homeId) ?? 1500, away: ratings.get(s.match.awayId) ?? 1500 };
}

/** The live model's (uncalibrated) prediction for a replayed fixture. */
export function predictSnapshot(
    s: Snapshot,
    elo: { home: number; away: number },
    params: ModelParams,
): MatchPrediction {
    const match: EnrichedMatch = {
        id: `${s.league}-${s.match.id}`,
        footballDataId: s.match.id,
        league: s.league,
        leagueName: LEAGUES[s.league].name,
        kickoff: s.match.utcDate,
        home: { ...s.home, elo: elo.home },
        away: { ...s.away, elo: elo.away },
        dataQuality: 'core',
    };
    return predictMatch(match, { leagueAverages: s.averages, params });
}
