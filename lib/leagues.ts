// lib/leagues.ts
// Canonical league configuration. One place to add/remove a competition.

import type { LeagueCode, LeagueConfig } from '@/types';

/** Season start year. 2026 => the 2026/27 campaign. */
export const CURRENT_SEASON = 2026;

export const LEAGUES: Record<LeagueCode, LeagueConfig> = {
    PL: {
        code: 'PL',
        apiFootballId: 39,
        season: CURRENT_SEASON,
        name: 'Premier League',
        shortName: 'Premier League',
        country: 'England',
        baseGoals: 2.85,
        baseCorners: 10.4,
        homeGoalShare: 0.55,
    },
    PD: {
        code: 'PD',
        apiFootballId: 140,
        season: CURRENT_SEASON,
        name: 'La Liga',
        shortName: 'La Liga',
        country: 'Spain',
        baseGoals: 2.55,
        baseCorners: 9.8,
        homeGoalShare: 0.56,
    },
    SA: {
        code: 'SA',
        apiFootballId: 135,
        season: CURRENT_SEASON,
        name: 'Serie A',
        shortName: 'Serie A',
        country: 'Italy',
        baseGoals: 2.75,
        baseCorners: 9.9,
        homeGoalShare: 0.55,
    },
    BL1: {
        code: 'BL1',
        apiFootballId: 78,
        season: CURRENT_SEASON,
        name: 'Bundesliga',
        shortName: 'Bundesliga',
        country: 'Germany',
        baseGoals: 3.15,
        baseCorners: 9.9,
        homeGoalShare: 0.55,
    },
    FL1: {
        code: 'FL1',
        apiFootballId: 61,
        season: CURRENT_SEASON,
        name: 'Ligue 1',
        shortName: 'Ligue 1',
        country: 'France',
        baseGoals: 2.6,
        baseCorners: 9.5,
        homeGoalShare: 0.56,
    },
    DED: {
        code: 'DED',
        apiFootballId: 88,
        season: CURRENT_SEASON,
        name: 'Eredivisie',
        shortName: 'Eredivisie',
        country: 'Netherlands',
        baseGoals: 3.3,
        baseCorners: 10.0,
        homeGoalShare: 0.55,
    },
};

export const LEAGUE_CODES = Object.keys(LEAGUES) as LeagueCode[];

export const leagueByCode = (code: string): LeagueConfig | undefined =>
    LEAGUES[code as LeagueCode];
