// lib/slip/types.ts
// Domain types + tuning constants for the bet-slip builder. Pure — no I/O, no
// `server-only`, so the client `SlipBuilder` imports straight from here.

import type { DataQuality, LeagueCode } from '@/types';

/** Every market a slip leg can be built from. */
export type SlipMarket =
    | 'home'
    | 'draw'
    | 'away'
    | 'dc1x' // double chance: home or draw
    | 'dcx2' // double chance: draw or away
    | 'dc12' // double chance: home or away (no draw)
    | 'over15'
    | 'over25'
    | 'over35'
    | 'btts'
    | 'corners95'
    | 'corners105';

export type SlipMode = 'target-odds' | 'single-market';
export type RiskPreset = 'safe' | 'balanced' | 'value';
export type SlipDateBucket = 'today' | 'tomorrow' | '3d' | 'week';

/** A candidate leg: one market on one fixture, priced. */
export interface Selection {
    matchId: string;
    league: LeagueCode;
    leagueName: string;
    kickoff: string;
    homeTeam: string;
    awayTeam: string;
    market: SlipMarket;
    /** Human-readable pick, e.g. "Arsenal or draw". */
    pick: string;
    /** Model probability of the pick landing, 0–1. */
    modelProbability: number;
    /** Fair (no-margin) decimal odds — 1 / modelProbability. */
    fairOdds: number;
    /** Bookmaker decimal odds, when the odds feed has them. */
    bookOdds: number | null;
    oddsSource: 'book' | 'consensus' | 'model';
    /** Bookmaker name when oddsSource is 'book'. */
    bookmaker: string | null;
    /** Odds used for combination maths: bookOdds when present, else fairOdds. */
    effectiveOdds: number;
    /** modelProbability × bookOdds − 1; positive = model sees value. Null w/o book odds. */
    edge: number | null;
    /** Fixture-level model confidence, 20–92. */
    confidence: number;
    dataQuality: DataQuality;
    /** False for the corners proxy (no real corner-count feed to grade against). */
    autoGradable: boolean;
    /** One short reason string lifted from the fixture's model drivers. */
    reason: string | null;
}

export interface SlipRequest {
    mode: SlipMode;
    /** target-odds mode: desired combined decimal odds. */
    targetOdds: number;
    /** target-odds mode: hard cap on legs. */
    maxLegs: number;
    /** single-market mode: which market. */
    market: SlipMarket;
    /** single-market mode: how many legs. */
    legs: number;
    leagues: LeagueCode[] | 'all';
    dateBucket: SlipDateBucket;
    /** Per-leg probability floor. */
    minProbability: number;
    risk: RiskPreset;
}

export interface BetSlip {
    legs: Selection[];
    /** Π leg probabilities (independence assumed). */
    combinedModelProbability: number;
    /** Π fairOdds = 1 / combinedModelProbability. */
    combinedFairOdds: number;
    /** Π bookOdds — null if any leg lacks book odds. */
    combinedBookOdds: number | null;
    /** Π effectiveOdds — always present; what the target is matched against. */
    combinedEffectiveOdds: number;
    /** combinedModelProbability × combinedBookOdds − 1. Null w/o full book odds. */
    combinedEdge: number | null;
    rationale: string[];
    warnings: string[];
}

// --- tuning ---------------------------------------------------------------

interface RiskConfig {
    /** Default per-leg probability floor for this preset. */
    minProbability: number;
    /** Ranking key for candidate selection. */
    rank: 'probability' | 'edge';
    /** When set, only these markets are eligible. */
    allowedMarkets?: SlipMarket[];
}

// Corners are never auto-selected — the proxy has no real corner-count feed and
// its probabilities run hot. They're only reachable via single-market mode.
const NON_CORNER_MARKETS: SlipMarket[] = [
    'home',
    'away',
    'dc1x',
    'dcx2',
    'dc12',
    'over15',
    'over25',
    'over35',
    'btts',
];

export const RISK_PRESETS: Record<RiskPreset, RiskConfig> = {
    safe: {
        minProbability: 0.62,
        rank: 'probability',
        allowedMarkets: ['home', 'away', 'dc1x', 'dcx2', 'dc12', 'over15', 'over25', 'btts'],
    },
    balanced: {
        minProbability: 0.55,
        rank: 'probability',
        allowedMarkets: NON_CORNER_MARKETS,
    },
    value: {
        minProbability: 0.5,
        rank: 'edge',
        allowedMarkets: NON_CORNER_MARKETS,
    },
};

/** Largest one-per-match candidate pool searched in target-odds mode. */
export const TARGET_ODDS_POOL_CAP = 12;

export interface MarketMeta {
    id: SlipMarket;
    label: string;
    /** Segmented-control label (shorter). */
    short: string;
    autoGradable: boolean;
}

export const MARKET_META: MarketMeta[] = [
    { id: 'home', label: 'Home win', short: 'Home', autoGradable: true },
    { id: 'away', label: 'Away win', short: 'Away', autoGradable: true },
    { id: 'dc1x', label: 'Home or draw', short: '1X', autoGradable: true },
    { id: 'dcx2', label: 'Draw or away', short: 'X2', autoGradable: true },
    { id: 'dc12', label: 'Home or away', short: '12', autoGradable: true },
    { id: 'over15', label: 'Over 1.5 goals', short: 'Over 1.5', autoGradable: true },
    { id: 'over25', label: 'Over 2.5 goals', short: 'Over 2.5', autoGradable: true },
    { id: 'over35', label: 'Over 3.5 goals', short: 'Over 3.5', autoGradable: true },
    { id: 'btts', label: 'Both teams to score', short: 'BTTS', autoGradable: true },
    { id: 'corners95', label: 'Over 9.5 corners', short: 'Corners 9.5', autoGradable: false },
    { id: 'corners105', label: 'Over 10.5 corners', short: 'Corners 10.5', autoGradable: false },
];

export const MARKET_LABEL: Record<SlipMarket, string> = Object.fromEntries(
    MARKET_META.map((m) => [m.id, m.label]),
) as Record<SlipMarket, string>;

/** Markets offered in single-market mode (draw-straight is excluded — poor value as an acca leg). */
export const SINGLE_MARKET_CHOICES: SlipMarket[] = [
    'home',
    'away',
    'dc1x',
    'dcx2',
    'over15',
    'over25',
    'over35',
    'btts',
    'corners95',
    'corners105',
];

export const DEFAULT_REQUEST: SlipRequest = {
    mode: 'target-odds',
    targetOdds: 2,
    maxLegs: 4,
    market: 'over15',
    legs: 3,
    leagues: 'all',
    dateBucket: 'week',
    minProbability: RISK_PRESETS.balanced.minProbability,
    risk: 'balanced',
};

/**
 * Canonical slips the app logs to its public record on every /slip build. Kept
 * corners-free so every leg is auto-gradable.
 */
export interface SlipPreset {
    id: string;
    label: string;
    request: SlipRequest;
}

const PRESET_BASE = { leagues: 'all', dateBucket: 'week' } as const;

export const SLIP_PRESETS: SlipPreset[] = [
    {
        id: 'safe-2',
        label: 'Safe · ~2 odds',
        request: {
            ...DEFAULT_REQUEST,
            ...PRESET_BASE,
            mode: 'target-odds',
            targetOdds: 2,
            maxLegs: 3,
            risk: 'safe',
            minProbability: RISK_PRESETS.safe.minProbability,
        },
    },
    {
        id: 'balanced-5',
        label: 'Balanced · ~5 odds',
        request: {
            ...DEFAULT_REQUEST,
            ...PRESET_BASE,
            mode: 'target-odds',
            targetOdds: 5,
            maxLegs: 4,
            risk: 'balanced',
            minProbability: RISK_PRESETS.balanced.minProbability,
        },
    },
    {
        id: 'over15-4',
        label: 'Over 1.5 · 4 legs',
        request: {
            ...DEFAULT_REQUEST,
            ...PRESET_BASE,
            mode: 'single-market',
            market: 'over15',
            legs: 4,
            risk: 'safe',
            minProbability: RISK_PRESETS.safe.minProbability,
        },
    },
    {
        id: 'btts-3',
        label: 'BTTS · 3 legs',
        request: {
            ...DEFAULT_REQUEST,
            ...PRESET_BASE,
            mode: 'single-market',
            market: 'btts',
            legs: 3,
            risk: 'balanced',
            minProbability: RISK_PRESETS.balanced.minProbability,
        },
    },
];

export const SLIP_PRESET_LABEL: Record<string, string> = Object.fromEntries(
    SLIP_PRESETS.map((p) => [p.id, p.label]),
);
