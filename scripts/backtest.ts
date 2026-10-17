// scripts/backtest.ts
// Replay past seasons through the live model, score it, and tune its constants.
//
//   npm run backtest                                  # last season + this one
//   npm run backtest -- --seasons 2024,2025,2026 --leagues PL,BL1
//   npm run backtest -- --no-fit                      # just score the defaults
//   npm run backtest -- --no-fit --params rho=-0.1,shrinkGames=12   # score an alternative
//
// Needs FOOTBALL_DATA_API_KEY (the npm script loads .env.local). One API call per
// league-season, paced under the free tier's 10/min and cached under
// .cache/backtest/, so reruns are offline. Reads football-data.org only — never
// the KV store, never API-Football.
//
// Train on every season but the latest; test on the latest (out-of-sample). With
// one season it splits chronologically, 70/30. Ship fitted parameters only when
// they beat the defaults on the *test* split.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CURRENT_SEASON, LEAGUE_CODES } from '@/lib/leagues';
import { DEFAULT_PARAMS, type ModelParams } from '@/lib/prediction/params';
import { replaySeason, type SeasonMatch } from '@/lib/backtest/replay';
import {
    baseRateForecaster,
    fitParams,
    MARKETS,
    modelForecaster,
    objective,
    score,
    type Fixture,
    type Scores,
} from '@/lib/backtest/fit';
import type { LeagueCode } from '@/types';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'backtest');
const API = 'https://api.football-data.org/v4';
const PACE_MS = 6_500;

// --- args ------------------------------------------------------------------

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const seasons = (arg('seasons') ?? `${CURRENT_SEASON - 1},${CURRENT_SEASON}`)
    .split(',')
    .map(Number)
    .filter(Number.isFinite)
    .sort();
const leagues = (arg('leagues')?.split(',') ?? LEAGUE_CODES) as LeagueCode[];
const doFit = !process.argv.includes('--no-fit');
const jsonOut = arg('json');

/** `--params a=1,b=2`: overrides on the defaults, scored as an extra row. */
function parseOverrides(spec: string | undefined): Partial<ModelParams> | null {
    if (!spec) return null;
    const out: Partial<ModelParams> = {};
    for (const pair of spec.split(',')) {
        const [k, v] = pair.split('=');
        if (!(k in DEFAULT_PARAMS) || !Number.isFinite(Number(v))) {
            throw new Error(`bad --params entry "${pair}" (known: ${Object.keys(DEFAULT_PARAMS).join(', ')})`);
        }
        out[k as keyof ModelParams] = Number(v);
    }
    return out;
}
const overrides = parseOverrides(arg('params'));

// --- data ------------------------------------------------------------------

interface FDMatch {
    id: number;
    utcDate: string;
    status: string;
    homeTeam: { id: number; name: string; shortName?: string };
    awayTeam: { id: number; name: string; shortName?: string };
    score?: { fullTime?: { home: number | null; away: number | null } };
}

let lastCall = 0;

async function loadSeason(code: LeagueCode, season: number): Promise<SeasonMatch[] | null> {
    // A finished season never changes; the current one is re-pulled once a day.
    const stamp = season >= CURRENT_SEASON ? `-${new Date().toISOString().slice(0, 10)}` : '';
    const file = path.join(CACHE_DIR, `${code}-${season}${stamp}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as SeasonMatch[];

    const key = process.env.FOOTBALL_DATA_API_KEY?.trim();
    if (!key) throw new Error('FOOTBALL_DATA_API_KEY is not set (and nothing is cached yet)');

    const wait = lastCall + PACE_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();

    const res = await fetch(`${API}/competitions/${code}/matches?season=${season}&status=FINISHED`, {
        headers: { 'X-Auth-Token': key },
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`  ${code} ${season}: HTTP ${res.status} ${body.slice(0, 120)}`);
        return null;
    }
    const data = (await res.json()) as { matches?: FDMatch[] };
    const matches: SeasonMatch[] = (data.matches ?? [])
        .filter(
            (m) =>
                m.status === 'FINISHED' &&
                m.score?.fullTime?.home != null &&
                m.score?.fullTime?.away != null,
        )
        .map((m) => ({
            id: m.id,
            utcDate: m.utcDate,
            homeId: m.homeTeam.id,
            awayId: m.awayTeam.id,
            homeName: m.homeTeam.shortName || m.homeTeam.name,
            awayName: m.awayTeam.shortName || m.awayTeam.name,
            homeGoals: m.score!.fullTime!.home as number,
            awayGoals: m.score!.fullTime!.away as number,
        }));
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(matches));
    return matches;
}

// --- report ----------------------------------------------------------------

const f3 = (x: number) => x.toFixed(4);
const pad = (s: string, n: number) => s.padEnd(n);
const lpad = (s: string, n: number) => s.padStart(n);

function scoreRow(label: string, s: Scores): string {
    return (
        pad(label, 22) +
        MARKETS.map((m) => lpad(f3(s.logLoss[m]), 9)).join('') +
        lpad(f3(objective(s)), 11) +
        lpad(`${(s.hitRate * 100).toFixed(1)}%`, 8)
    );
}

function printScores(title: string, rows: Array<[string, Scores]>): void {
    console.log(`\n${title} — mean log-loss (lower is better)`);
    console.log(
        pad('', 22) + MARKETS.map((m) => lpad(m, 9)).join('') + lpad('objective', 11) + lpad('1X2 hit', 8),
    );
    for (const [label, s] of rows) console.log(scoreRow(label, s));
}

// --- main ------------------------------------------------------------------

async function main(): Promise<void> {
    console.log(`Backtest · seasons ${seasons.join(', ')} · leagues ${leagues.join(', ')}`);

    const bySeason = new Map<number, Fixture[]>();
    for (const season of seasons) {
        for (const code of leagues) {
            const matches = await loadSeason(code, season);
            if (!matches || matches.length === 0) continue;
            const replay = replaySeason(code, matches);
            const fixtures = replay.snapshots.map((snapshot) => ({ replay, snapshot }));
            bySeason.set(season, [...(bySeason.get(season) ?? []), ...fixtures]);
            console.log(`  ${code} ${season}: ${matches.length} finished matches`);
        }
    }
    const loaded = [...bySeason.keys()].sort();
    if (loaded.length === 0) throw new Error('no season data could be loaded');

    let train: Fixture[];
    let test: Fixture[];
    let split: string;
    if (loaded.length > 1) {
        const testSeason = loaded[loaded.length - 1];
        train = loaded.slice(0, -1).flatMap((s) => bySeason.get(s)!);
        test = bySeason.get(testSeason)!;
        split = `train ${loaded.slice(0, -1).join(', ')} · test ${testSeason}`;
    } else {
        const all = bySeason.get(loaded[0])!.sort((a, b) =>
            a.snapshot.match.utcDate.localeCompare(b.snapshot.match.utcDate),
        );
        const cut = Math.floor(all.length * 0.7);
        train = all.slice(0, cut);
        test = all.slice(cut);
        split = `season ${loaded[0]} split chronologically 70/30`;
    }
    console.log(`\n${split} · ${train.length} train / ${test.length} test fixtures`);

    const base = baseRateForecaster(train);
    const rows = {
        train: [
            ['base rate', score(train, base)],
            ['default params', score(train, modelForecaster(DEFAULT_PARAMS))],
        ] as Array<[string, Scores]>,
        test: [
            ['base rate', score(test, base)],
            ['default params', score(test, modelForecaster(DEFAULT_PARAMS))],
        ] as Array<[string, Scores]>,
    };

    if (overrides) {
        const custom = { ...DEFAULT_PARAMS, ...overrides };
        const label = `--params`;
        rows.train.push([label, score(train, modelForecaster(custom))]);
        rows.test.push([label, score(test, modelForecaster(custom))]);
    }

    let fitted: ModelParams | null = null;
    if (doFit) {
        console.log('\nFitting on the train split (coordinate descent)…');
        const started = Date.now();
        const result = fitParams(train, DEFAULT_PARAMS, undefined, undefined, (param, value, o) =>
            console.log(`  ${pad(param, 18)} → ${lpad(String(value), 6)}   objective ${f3(o)}`),
        );
        fitted = result.params;
        console.log(`  ${result.evaluations} evaluations in ${((Date.now() - started) / 1000).toFixed(1)}s`);
        rows.train.push(['fitted params', score(train, modelForecaster(fitted))]);
        rows.test.push(['fitted params', score(test, modelForecaster(fitted))]);
    }

    printScores('TRAIN', rows.train);
    printScores('TEST (out-of-sample)', rows.test);

    if (fitted) {
        console.log('\nParameter          default    fitted');
        for (const k of Object.keys(DEFAULT_PARAMS) as Array<keyof ModelParams>) {
            const changed = fitted[k] !== DEFAULT_PARAMS[k] ? '  *' : '';
            console.log(`${pad(k, 18)}${lpad(String(DEFAULT_PARAMS[k]), 8)}${lpad(String(fitted[k]), 10)}${changed}`);
        }
        const before = objective(rows.test[1][1]);
        const after = objective(rows.test[rows.test.length - 1][1]);
        const verdict =
            after < before
                ? `fitted beats default out-of-sample by ${f3(before - after)} — worth adopting in lib/prediction/params.ts`
                : `fitted does NOT beat default out-of-sample (${f3(after)} vs ${f3(before)}) — keep the defaults`;
        console.log(`\nVerdict: ${verdict}`);
    }

    if (jsonOut) {
        writeFileSync(
            jsonOut,
            JSON.stringify({ seasons: loaded, leagues, split, rows, defaults: DEFAULT_PARAMS, fitted }, null, 2),
        );
        console.log(`\nWrote ${jsonOut}`);
    }
}

main().catch((err) => {
    console.error(`backtest failed: ${(err as Error).message}`);
    process.exit(1);
});
