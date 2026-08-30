// types/index.ts
// Domain model for PredictaAI.

export type LeagueCode = 'PL' | 'PD' | 'SA' | 'BL1' | 'FL1' | 'DED';

export interface LeagueConfig {
    /** Football-Data.org v4 competition code. */
    code: LeagueCode;
    /** API-Football league id (RapidAPI). */
    apiFootballId: number;
    /** Current season start year, e.g. 2026 for 2026/27. */
    season: number;
    name: string;
    shortName: string;
    country: string;
    /** League-average total goals per match (used as a prior for shrinkage). */
    baseGoals: number;
    /** League-average total corners per match. */
    baseCorners: number;
    /** Home-side share of total goals (0-1), league-typical home advantage. */
    homeGoalShare: number;
}

/** A team as we model it. */
export interface Team {
    id: number;
    name: string;
    shortName: string;
    tla: string;
    crest?: string;
}

/** Split (home or away) of a team's league record. */
export interface RecordSplit {
    played: number;
    won: number;
    draw: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
}

/** Everything the model knows about one team going into a match. */
export interface TeamStrength {
    team: Team;
    /** Full-season record. */
    overall: RecordSplit;
    /** Home-only record (from the HOME standings sub-table). */
    home: RecordSplit;
    /** Away-only record (from the AWAY standings sub-table). */
    away: RecordSplit;
    /** Recent results, most-recent first, e.g. ['W','D','L','W','W']. */
    form: Array<'W' | 'D' | 'L'>;
    /** Current Elo rating. */
    elo: number;
    /** Optional enrichment from API-Football (per-match averages). */
    enriched?: TeamEnrichment;
}

/** What API-Football's free tier actually gives us cheaply (via /predictions). */
export interface TeamEnrichment {
    /** Last-5 goals scored per game. */
    recentGoalsFor: number;
    /** Last-5 goals conceded per game. */
    recentGoalsAgainst: number;
    /** Provider attack rating, 0-1. */
    attackRating: number;
    /** Provider defence rating, 0-1. */
    defenseRating: number;
    /** Points from the last 5 (W=3, D=1). */
    formPoints: number;
}

export type DataQuality = 'enriched' | 'core';

/** A fixture plus the strength profiles of both sides. */
export interface EnrichedMatch {
    /** `${leagueCode}-${footballDataMatchId}` */
    id: string;
    footballDataId: number;
    apiFootballFixtureId?: number;
    league: LeagueCode;
    leagueName: string;
    /** ISO kickoff time (UTC). */
    kickoff: string;
    venue?: string;
    home: TeamStrength;
    away: TeamStrength;
    /** Head-to-head summary of recent meetings, if available. */
    h2h?: HeadToHead;
    /** API-Football's own 1X2 probabilities (0-1, sum 1), when enriched. */
    providerOutcome?: OutcomeProbabilities;
    dataQuality: DataQuality;
}

export interface HeadToHead {
    matches: number;
    homeWins: number;
    draws: number;
    awayWins: number;
    avgGoals: number;
    bttsRate: number;
}

// ---------------------------------------------------------------------------
// Predictions
// ---------------------------------------------------------------------------

export interface OutcomeProbabilities {
    home: number;
    draw: number;
    away: number;
}

export interface MarketLine {
    /** Probability (0-1) of the "over" / "yes" side. */
    probability: number;
    /** 'over' | 'under' | 'yes' | 'no' | null (no lean). */
    lean: 'over' | 'under' | 'yes' | 'no' | null;
}

export interface MarketProbabilities {
    over15: MarketLine;
    over25: MarketLine;
    over35: MarketLine;
    btts: MarketLine;
    corners: {
        over85: MarketLine;
        over95: MarketLine;
        over105: MarketLine;
        over115: MarketLine;
    } | null;
}

export interface Scoreline {
    home: number;
    away: number;
    probability: number;
}

export interface MatchPrediction {
    matchId: string;
    outcome: OutcomeProbabilities;
    expectedGoals: { home: number; away: number; total: number };
    predictedScore: { home: number; away: number };
    topScorelines: Scoreline[];
    markets: MarketProbabilities;
    /** 0-100. Real quantity derived from distribution sharpness x data quality. */
    confidence: number;
    dataQuality: DataQuality;
    /** Short human-readable reasons, generated from real model inputs. */
    drivers: string[];
    modelVersion: string;
}

/** A prediction as persisted for later grading. */
export interface TrackedPrediction {
    matchId: string;
    league: LeagueCode;
    kickoff: string;
    home: string;
    away: string;
    outcome: OutcomeProbabilities;
    predictedScore: { home: number; away: number };
    markets: {
        over15: number;
        over25: number;
        over35: number;
        btts: number;
    };
    modelVersion: string;
    createdAt: string;
}

export interface GradedResult {
    matchId: string;
    league: LeagueCode;
    finalScore: { home: number; away: number };
    gradedAt: string;
    /** Per-market correctness. */
    hits: {
        outcome: boolean;
        over25: boolean;
        btts: boolean;
    };
    /** Brier score contribution for the 1X2 forecast (0 best, 2 worst). */
    brier1x2: number;
}

export interface MatchWithPrediction {
    match: EnrichedMatch;
    prediction: MatchPrediction;
}

export interface MarketStat {
    n: number;
    hits: number;
    brier: number;
}

export interface RollingStats {
    updatedAt: string;
    window: '30d' | '90d' | 'all';
    outcome: MarketStat;
    over25: MarketStat;
    btts: MarketStat;
    /** Calibration bins for the 1X2 favourite: predicted vs actual by decile. */
    calibration: Array<{ bin: number; predicted: number; actual: number; n: number }>;
    byLeague: Partial<Record<LeagueCode, MarketStat>>;
}
