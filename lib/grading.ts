// lib/grading.ts
// The arithmetic behind /accuracy: grade one finished match, fold the result
// into an aggregate (all-time, one model version, or one kickoff day), merge
// day buckets into a window, and turn bookmaker odds into the market's implied
// probabilities. Pure — lib/tracking.ts does the storage.

import type {
    CalibrationBin,
    FixtureOdds,
    GradedResult,
    MarketKey,
    MarketSnapshot,
    MarketStat,
    OutcomeProbabilities,
    RollingStats,
    TrackedPrediction,
    VsMarketStat,
} from '@/types';
import {
    binaryBrier,
    binaryLogLoss,
    outcomeBrier,
    outcomeLogLoss,
    outcomeOf,
} from '@/lib/scoring';

// --- empty aggregates ------------------------------------------------------

export const emptyStat = (): MarketStat => ({
    n: 0,
    hits: 0,
    brier: 0,
    scored: 0,
    brierSum: 0,
    logLossSum: 0,
});

export const emptyCalBins = (): CalibrationBin[] =>
    Array.from({ length: 10 }, (_, i) => ({ bin: i, predicted: 0, actual: 0, n: 0 }));

const emptyVs = (): VsMarketStat => ({
    n: 0,
    modelBrier: 0,
    marketBrier: 0,
    modelLogLoss: 0,
    marketLogLoss: 0,
});

export function emptyRolling(
    window: RollingStats['window'] = 'all',
    modelVersion?: string,
): RollingStats {
    return {
        updatedAt: new Date(0).toISOString(),
        window,
        ...(modelVersion ? { modelVersion } : {}),
        outcome: emptyStat(),
        over15: emptyStat(),
        over25: emptyStat(),
        over35: emptyStat(),
        btts: emptyStat(),
        corners95: emptyStat(),
        corners105: emptyStat(),
        calibration: emptyCalBins(),
        cornersCalibration: { over95: emptyCalBins(), over105: emptyCalBins() },
        rawCalibration: { outcome: emptyCalBins(), over95: emptyCalBins(), over105: emptyCalBins() },
        vsMarket: {},
        byLeague: {},
    };
}

// --- one match -------------------------------------------------------------

const BINARY = ['over15', 'over25', 'over35', 'btts'] as const;
type BinaryMarket = (typeof BINARY)[number];

/** Did each binary market's "yes"/"over" side happen? */
function happened(m: BinaryMarket, home: number, away: number): boolean {
    switch (m) {
        case 'over15':
            return home + away > 1.5;
        case 'over25':
            return home + away > 2.5;
        case 'over35':
            return home + away > 3.5;
        case 'btts':
            return home > 0 && away > 0;
    }
}

/** A lean "hits" when its side of 50% matches what happened. */
const leanHit = (p: number, yes: boolean) => (p >= 0.5) === yes;

export function gradeResult(
    tracked: TrackedPrediction,
    finalHome: number,
    finalAway: number,
    gradedAt = new Date(),
): GradedResult {
    const actual = outcomeOf(finalHome, finalAway);
    const picked = (['home', 'draw', 'away'] as const).reduce((a, b) =>
        tracked.outcome[a] >= tracked.outcome[b] ? a : b,
    );
    const yes = (m: BinaryMarket) => happened(m, finalHome, finalAway);
    return {
        matchId: tracked.matchId,
        league: tracked.league,
        finalScore: { home: finalHome, away: finalAway },
        gradedAt: gradedAt.toISOString(),
        hits: {
            outcome: picked === actual,
            over15: leanHit(tracked.markets.over15, yes('over15')),
            over25: leanHit(tracked.markets.over25, yes('over25')),
            over35: leanHit(tracked.markets.over35, yes('over35')),
            btts: leanHit(tracked.markets.btts, yes('btts')),
        },
        brier1x2: outcomeBrier(tracked.outcome, actual),
    };
}

// --- folding into an aggregate --------------------------------------------

function addScore(s: MarketStat, hit: boolean, brier: number, logLoss: number): void {
    s.n += 1;
    s.hits += hit ? 1 : 0;
    s.scored = (s.scored ?? 0) + 1;
    s.brierSum = (s.brierSum ?? 0) + brier;
    s.logLossSum = (s.logLossSum ?? 0) + logLoss;
}

/** Fold one forecast (prob of the "yes"/"over" side, and whether it landed) into its decile. */
function foldCalBin(bins: CalibrationBin[], predicted: number, hit: boolean): void {
    const b = bins[Math.min(9, Math.floor(predicted * 10))];
    b.n += 1;
    b.predicted += predicted;
    b.actual += hit ? 1 : 0;
}

/** Fields added after the first aggregates were written, created on first use. */
function upgrade(stats: RollingStats): Required<Pick<RollingStats, 'over35' | 'rawCalibration' | 'vsMarket'>> {
    stats.over15 ??= emptyStat();
    stats.over35 ??= emptyStat();
    stats.corners95 ??= emptyStat();
    stats.corners105 ??= emptyStat();
    stats.cornersCalibration ??= { over95: emptyCalBins(), over105: emptyCalBins() };
    stats.rawCalibration ??= { outcome: emptyCalBins(), over95: emptyCalBins(), over105: emptyCalBins() };
    stats.vsMarket ??= {};
    return { over35: stats.over35, rawCalibration: stats.rawCalibration, vsMarket: stats.vsMarket };
}

function foldVsMarket(
    vs: Partial<Record<MarketKey, VsMarketStat>>,
    key: MarketKey,
    model: { brier: number; logLoss: number },
    market: { brier: number; logLoss: number },
): void {
    const s = (vs[key] ??= emptyVs());
    s.n += 1;
    s.modelBrier += model.brier;
    s.marketBrier += market.brier;
    s.modelLogLoss += model.logLoss;
    s.marketLogLoss += market.logLoss;
}

/**
 * Fold one graded match into an aggregate: hit rates, Brier and log-loss per
 * market, the public calibration chart, the raw learning bins, the per-league
 * line, and — when a pre-kickoff price was logged — model vs market.
 */
export function foldResult(
    stats: RollingStats,
    tracked: TrackedPrediction,
    r: GradedResult,
    market?: MarketSnapshot | null,
): void {
    const { rawCalibration, vsMarket } = upgrade(stats);
    const { home: h, away: a } = r.finalScore;
    const actual = outcomeOf(h, a);

    const outcomeLL = outcomeLogLoss(tracked.outcome, actual);
    stats.outcome.brier += r.brier1x2;
    addScore(stats.outcome, r.hits.outcome, r.brier1x2, outcomeLL);

    for (const m of BINARY) {
        const p = tracked.markets[m];
        const yes = happened(m, h, a);
        addScore(stats[m]!, r.hits[m] ?? leanHit(p, yes), binaryBrier(p, yes), binaryLogLoss(p, yes));
    }

    // Public chart: the published favourite probability vs how often it landed.
    const fav = Math.max(tracked.outcome.home, tracked.outcome.draw, tracked.outcome.away);
    foldCalBin(stats.calibration, fav, r.hits.outcome);

    // Learning bins: every raw outcome probability, one-vs-rest.
    if (tracked.raw) {
        for (const k of ['home', 'draw', 'away'] as const) {
            foldCalBin(rawCalibration.outcome, tracked.raw.outcome[k], actual === k);
        }
    }

    const lg = (stats.byLeague[tracked.league] ??= emptyStat());
    lg.brier += r.brier1x2;
    addScore(lg, r.hits.outcome, r.brier1x2, outcomeLL);

    if (market?.outcome) {
        foldVsMarket(
            vsMarket,
            'outcome',
            { brier: r.brier1x2, logLoss: outcomeLL },
            {
                brier: outcomeBrier(market.outcome, actual),
                logLoss: outcomeLogLoss(market.outcome, actual),
            },
        );
    }
    for (const m of BINARY) {
        const q = market?.[m];
        if (q == null) continue;
        const p = tracked.markets[m];
        const yes = happened(m, h, a);
        foldVsMarket(
            vsMarket,
            m,
            { brier: binaryBrier(p, yes), logLoss: binaryLogLoss(p, yes) },
            { brier: binaryBrier(q, yes), logLoss: binaryLogLoss(q, yes) },
        );
    }

    stats.updatedAt = r.gradedAt;
}

/** The corners hit/miss for a match, or null when it carried no corners lines. */
export function cornerHits(
    tracked: TrackedPrediction,
    totalCorners: number,
): { corners95: boolean; corners105: boolean } | null {
    const { corners95, corners105 } = tracked.markets;
    if (corners95 == null || corners105 == null) return null;
    return {
        corners95: leanHit(corners95, totalCorners > 9.5),
        corners105: leanHit(corners105, totalCorners > 10.5),
    };
}

/** Fold a match's corners grade (a separate, later pass) into an aggregate. */
export function foldCorners(
    stats: RollingStats,
    tracked: TrackedPrediction,
    totalCorners: number,
    at = new Date(),
): void {
    const hits = cornerHits(tracked, totalCorners);
    if (!hits) return;
    const { rawCalibration } = upgrade(stats);
    const lines = [
        ['corners95', tracked.markets.corners95!, totalCorners > 9.5, tracked.raw?.corners95, 'over95'],
        ['corners105', tracked.markets.corners105!, totalCorners > 10.5, tracked.raw?.corners105, 'over105'],
    ] as const;
    for (const [key, p, yes, raw, bins] of lines) {
        addScore(stats[key], hits[key], binaryBrier(p, yes), binaryLogLoss(p, yes));
        foldCalBin(stats.cornersCalibration[bins], p, yes);
        if (raw != null) foldCalBin(rawCalibration[bins], raw, yes);
    }
    stats.updatedAt = at.toISOString();
}

// --- merging buckets into a window ----------------------------------------

function mergeStat(a: MarketStat | undefined, b: MarketStat | undefined): MarketStat {
    const x = a ?? emptyStat();
    const y = b ?? emptyStat();
    return {
        n: x.n + y.n,
        hits: x.hits + y.hits,
        brier: x.brier + y.brier,
        scored: (x.scored ?? 0) + (y.scored ?? 0),
        brierSum: (x.brierSum ?? 0) + (y.brierSum ?? 0),
        logLossSum: (x.logLossSum ?? 0) + (y.logLossSum ?? 0),
    };
}

function mergeBins(a: CalibrationBin[] | undefined, b: CalibrationBin[] | undefined): CalibrationBin[] {
    return emptyCalBins().map((bin, i) => ({
        bin: bin.bin,
        n: (a?.[i]?.n ?? 0) + (b?.[i]?.n ?? 0),
        predicted: (a?.[i]?.predicted ?? 0) + (b?.[i]?.predicted ?? 0),
        actual: (a?.[i]?.actual ?? 0) + (b?.[i]?.actual ?? 0),
    }));
}

function mergeTwo(a: RollingStats, b: RollingStats): RollingStats {
    const vsMarket: Partial<Record<MarketKey, VsMarketStat>> = {};
    for (const k of ['outcome', ...BINARY] as MarketKey[]) {
        const x = a.vsMarket?.[k];
        const y = b.vsMarket?.[k];
        if (!x && !y) continue;
        const s = emptyVs();
        for (const f of Object.keys(s) as Array<keyof VsMarketStat>) s[f] = (x?.[f] ?? 0) + (y?.[f] ?? 0);
        vsMarket[k] = s;
    }
    const byLeague: RollingStats['byLeague'] = {};
    for (const code of new Set([...Object.keys(a.byLeague), ...Object.keys(b.byLeague)])) {
        const key = code as keyof RollingStats['byLeague'];
        byLeague[key] = mergeStat(a.byLeague[key], b.byLeague[key]);
    }
    return {
        updatedAt: a.updatedAt > b.updatedAt ? a.updatedAt : b.updatedAt,
        window: a.window,
        outcome: mergeStat(a.outcome, b.outcome),
        over15: mergeStat(a.over15, b.over15),
        over25: mergeStat(a.over25, b.over25),
        over35: mergeStat(a.over35, b.over35),
        btts: mergeStat(a.btts, b.btts),
        corners95: mergeStat(a.corners95, b.corners95),
        corners105: mergeStat(a.corners105, b.corners105),
        calibration: mergeBins(a.calibration, b.calibration),
        cornersCalibration: {
            over95: mergeBins(a.cornersCalibration?.over95, b.cornersCalibration?.over95),
            over105: mergeBins(a.cornersCalibration?.over105, b.cornersCalibration?.over105),
        },
        rawCalibration: {
            outcome: mergeBins(a.rawCalibration?.outcome, b.rawCalibration?.outcome),
            over95: mergeBins(a.rawCalibration?.over95, b.rawCalibration?.over95),
            over105: mergeBins(a.rawCalibration?.over105, b.rawCalibration?.over105),
        },
        vsMarket,
        byLeague,
    };
}

/** Sum aggregates (e.g. day buckets) into one; null when there's nothing to sum. */
export function mergeStats(window: RollingStats['window'], parts: RollingStats[]): RollingStats | null {
    if (parts.length === 0) return null;
    return parts.reduce((acc, s) => mergeTwo(acc, s), emptyRolling(window));
}

// --- bookmaker odds → the market's probabilities ---------------------------

/** Two-way market with the margin removed: P(yes) = (1/yes) / (1/yes + 1/no). */
function twoWay(yes: number | undefined, no: number | undefined): number | undefined {
    if (!yes || !no || yes <= 1 || no <= 1) return undefined;
    return 1 / yes / (1 / yes + 1 / no);
}

/** 1X2 with the margin removed (proportional normalisation). */
function threeWay(home?: number, draw?: number, away?: number): OutcomeProbabilities | undefined {
    if (!home || !draw || !away || home <= 1 || draw <= 1 || away <= 1) return undefined;
    const s = 1 / home + 1 / draw + 1 / away;
    return { home: 1 / home / s, draw: 1 / draw / s, away: 1 / away / s };
}

/** The market's implied probabilities from a fixture's odds; null if no market is two-sided. */
export function impliedProbabilities(odds: FixtureOdds): MarketSnapshot | null {
    const m = odds.markets;
    const implied = {
        outcome: threeWay(m.home, m.draw, m.away),
        over15: twoWay(m.over15, m.under15),
        over25: twoWay(m.over25, m.under25),
        over35: twoWay(m.over35, m.under35),
        btts: twoWay(m.btts, m.bttsNo),
    };
    const present = Object.fromEntries(Object.entries(implied).filter(([, v]) => v !== undefined));
    if (Object.keys(present).length === 0) return null;
    return {
        ...present,
        source: odds.source,
        bookmaker: odds.bookmaker,
        fetchedAt: odds.fetchedAt,
    };
}

// --- reading an aggregate ---------------------------------------------------

/** Mean Brier and log-loss for a market, or null before any forecast was scored. */
export function meanScores(s: MarketStat | undefined): { brier: number; logLoss: number } | null {
    if (!s?.scored) return null;
    return { brier: (s.brierSum ?? 0) / s.scored, logLoss: (s.logLossSum ?? 0) / s.scored };
}
