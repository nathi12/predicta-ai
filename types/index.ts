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
    /** API-Football team ids, resolved with the fixture id. Exact key for the
     *  per-team corners-rate history. */
    apiFootballHomeId?: number;
    apiFootballAwayId?: number;
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
        /** Expected total corners the lines are derived from. */
        expected: number;
        /** 'proxy' = scaled off expected goals; 'team-rates' = blended with each
         *  side's real corners-for/against history from API-Football. */
        source: 'proxy' | 'team-rates';
    } | null;
}

/** Corners won/conceded per game over one venue's sampled window. */
export interface VenueCornerRate {
    /** Mean corners won per game. */
    for: number;
    /** Mean corners conceded per game. */
    against: number;
    /** Games in the sample. */
    n: number;
}

/**
 * Rolling corners-per-game history for one team, from API-Football match stats,
 * split by venue — home teams reliably win more corners than they do away, so
 * the blend pairs each side's venue-correct rate with the other's.
 */
export interface CornerRate {
    /** This team's rate in matches it played at home. */
    atHome: VenueCornerRate;
    /** This team's rate in matches it played away. */
    atAway: VenueCornerRate;
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
        /** Corner-total over 9.5 / 10.5 probabilities. Absent on records made
         *  before corners tracking, or when the model produced no corners line. */
        corners95?: number;
        corners105?: number;
    };
    /** API-Football fixture id, resolved before kickoff. The only feed with
     *  corner counts, so corners can't be graded without it. */
    apiFootballFixtureId?: number;
    /** API-Football team ids, resolved with the fixture id. Let the corners
     *  grader attribute each side's count to the right venue. */
    apiFootballHomeId?: number;
    apiFootballAwayId?: number;
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
        over15: boolean;
        over25: boolean;
        btts: boolean;
        /** Corners are graded in a later pass (needs an API-Football stats call),
         *  so these stay undefined until that pass runs — or forever if it can't
         *  resolve a corner count for the fixture. */
        corners95?: boolean;
        corners105?: boolean;
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

/** One decile bucket of a market's calibration: summed forecast, hits, count. */
export interface CalibrationBin {
    bin: number;
    predicted: number;
    actual: number;
    n: number;
}

export interface RollingStats {
    updatedAt: string;
    window: '30d' | '90d' | 'all';
    outcome: MarketStat;
    over15: MarketStat;
    over25: MarketStat;
    btts: MarketStat;
    /** Over 9.5 / 10.5 total corners, graded off API-Football match stats. */
    corners95: MarketStat;
    corners105: MarketStat;
    /** Calibration bins for the 1X2 favourite: predicted vs actual by decile. */
    calibration: CalibrationBin[];
    /** Calibration bins for the corners over-9.5 / over-10.5 lines. */
    cornersCalibration: { over95: CalibrationBin[]; over105: CalibrationBin[] };
    byLeague: Partial<Record<LeagueCode, MarketStat>>;
}

// ---------------------------------------------------------------------------
// Bet-slip builder
// ---------------------------------------------------------------------------

/** Bookmaker odds for a fixture, distilled to the markets the slip builder uses. */
export interface FixtureOdds {
    fixtureId: number;
    /** 'book' = the configured preferred bookmaker; 'consensus' = median of books. */
    source: 'book' | 'consensus';
    /** Human-readable bookmaker name when source is 'book'. */
    bookmaker: string | null;
    fetchedAt: string;
    /** Decimal odds, keyed by the same market ids the slip builder uses. */
    markets: Partial<
        Record<
            | 'home'
            | 'draw'
            | 'away'
            | 'dc1x'
            | 'dcx2'
            | 'dc12'
            | 'over15'
            | 'over25'
            | 'over35'
            | 'btts'
            | 'bttsNo'
            | 'corners95'
            | 'corners105',
            number
        >
    >;
}

/** One leg of a curated slip, as persisted for later grading. */
export interface SlipLeg {
    matchId: string;
    league: LeagueCode;
    kickoff: string;
    home: string;
    away: string;
    /** SlipMarket id (see lib/slip/types.ts). */
    market: string;
    pick: string;
    modelProbability: number;
    bookOdds: number | null;
    oddsSource: 'book' | 'consensus' | 'model';
}

/** A curated slip as persisted when it's first shown. */
export interface SlipRecord {
    slipId: string;
    presetId: string;
    mode: 'target-odds' | 'single-market';
    legs: SlipLeg[];
    combinedModelProbability: number;
    combinedFairOdds: number;
    combinedBookOdds: number | null;
    modelVersion: string;
    createdAt: string;
}

export interface GradedSlip {
    slipId: string;
    presetId: string;
    gradedAt: string;
    legResults: Array<{ matchId: string; pick: string; hit: boolean }>;
    /** Every leg hit. */
    won: boolean;
    combinedBookOdds: number | null;
    /** Return per 1 unit staked: the combined odds if won, else 0. */
    payoutMultiple: number;
}

export interface SlipMarketStat {
    n: number;
    won: number;
    /** Units staked (1 per slip). */
    staked: number;
    /** Units returned (payoutMultiple summed). */
    returned: number;
}

export interface SlipRollingStats {
    updatedAt: string;
    overall: SlipMarketStat;
    byPreset: Record<string, SlipMarketStat>;
}
