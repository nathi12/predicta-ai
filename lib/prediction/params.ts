// lib/prediction/params.ts
// The model's tunable constants in one place, so the backtest
// (scripts/backtest.ts) can search them and the live build can't drift from
// what was tested. Production always runs DEFAULT_PARAMS.

export interface ModelParams {
    /** Dixon-Coles low-score correlation; negative lifts 0-0 / 1-1. */
    rho: number;
    /** Goal model's share of the 1X2 blend; Elo gets the rest. */
    poissonWeight: number;
    /** Provider's share of the 1X2 when an enriched fixture has one. */
    providerWeight: number;
    /** Prior strength, in games, pulling team scoring rates to the league mean. */
    shrinkGames: number;
    /** Expected-goals nudge per point-per-game of recent form above/below 1.35. */
    formSlope: number;
    /** Cap on that nudge, either way. */
    formCap: number;
    /** Elo K-factor for replaying the season's results. */
    eloK: number;
    /** Home advantage in Elo points. */
    eloHomeAdvantage: number;
    /** How far head-to-head goal averages pull the projected total. */
    h2hWeight: number;
}

/**
 * Fitted by `npm run backtest` on 2026-10-17: trained on the full 2025/26 season
 * (2,057 fixtures, six leagues), checked out-of-sample on 2026/27 to date (383).
 * Mean log-loss on the test season, old → fitted:
 *   1X2 1.0447 → 1.0477 (within noise) · O1.5 0.5006 → 0.4931 · O2.5 0.6833 → 0.6700
 *   O3.5 0.6982 → 0.6780 · BTTS 0.6780 → 0.6736 · objective 2.4060 → 2.3913.
 * The old goal markets scored *worse* than quoting last season's base rates; the
 * heavy shrinkage (40 games) is what fixed that — venue-split table rates are a
 * noisy read of team strength. providerWeight and h2hWeight have no history to
 * fit against and keep their hand-set values.
 * Previous values: rho −0.06, poissonWeight 0.58, shrinkGames 5, eloHomeAdvantage 65.
 */
export const DEFAULT_PARAMS: ModelParams = {
    rho: -0.15,
    poissonWeight: 0.3,
    providerWeight: 0.22,
    shrinkGames: 40,
    formSlope: 0.06,
    formCap: 0.08,
    eloK: 20,
    eloHomeAdvantage: 50,
    h2hWeight: 0.1,
};
