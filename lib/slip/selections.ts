// lib/slip/selections.ts
// Flatten every upcoming fixture into a flat list of priced candidate legs.

import type { FixtureOdds, MatchWithPrediction } from '@/types';
import { fairOdds, withinBucket } from './format';
import {
    MARKET_LABEL,
    RISK_PRESETS,
    type Selection,
    type SlipMarket,
    type SlipRequest,
} from './types';

type OddsMap = Record<string, FixtureOdds>;

/** All markets we can price, with the probability read off a MatchPrediction. */
const MARKET_PROB: Record<SlipMarket, (p: MatchWithPrediction['prediction']) => number | null> = {
    home: (p) => p.outcome.home,
    draw: (p) => p.outcome.draw,
    away: (p) => p.outcome.away,
    dc1x: (p) => p.outcome.home + p.outcome.draw,
    dcx2: (p) => p.outcome.draw + p.outcome.away,
    dc12: (p) => p.outcome.home + p.outcome.away,
    over15: (p) => p.markets.over15.probability,
    over25: (p) => p.markets.over25.probability,
    over35: (p) => p.markets.over35.probability,
    btts: (p) => p.markets.btts.probability,
    corners95: (p) => p.markets.corners?.over95.probability ?? null,
    corners105: (p) => p.markets.corners?.over105.probability ?? null,
};

const AUTO_GRADABLE: Record<SlipMarket, boolean> = {
    home: true,
    draw: true,
    away: true,
    dc1x: true,
    dcx2: true,
    dc12: true,
    over15: true,
    over25: true,
    over35: true,
    btts: true,
    corners95: false,
    corners105: false,
};

function pickLabel(market: SlipMarket, home: string, away: string): string {
    switch (market) {
        case 'home':
            return `${home} to win`;
        case 'away':
            return `${away} to win`;
        case 'draw':
            return 'Draw';
        case 'dc1x':
            return `${home} or draw`;
        case 'dcx2':
            return `${away} or draw`;
        case 'dc12':
            return `${home} or ${away} (no draw)`;
        default:
            return MARKET_LABEL[market];
    }
}

export interface EnumerateOptions {
    /** Restrict to a single market (single-market mode). Default: every allowed market. */
    onlyMarket?: SlipMarket;
    /** Override "now" for deterministic tests. */
    now?: Date;
}

/**
 * Build the candidate-leg list for a request. Applies league / date-window /
 * probability-floor / risk-preset-market filters. One fixture yields up to one
 * leg per eligible market; the builder later enforces one leg per fixture.
 */
export function enumerateSelections(
    matches: MatchWithPrediction[],
    odds: OddsMap,
    req: SlipRequest,
    opts: EnumerateOptions = {},
): Selection[] {
    const now = opts.now ?? new Date();
    const preset = RISK_PRESETS[req.risk];
    const allowed: SlipMarket[] = opts.onlyMarket
        ? [opts.onlyMarket]
        : (preset.allowedMarkets ?? (Object.keys(MARKET_PROB) as SlipMarket[]));

    const out: Selection[] = [];

    for (const { match, prediction } of matches) {
        if (req.leagues !== 'all' && !req.leagues.includes(match.league)) continue;
        if (!withinBucket(match.kickoff, req.dateBucket, now)) continue;
        if (new Date(match.kickoff).getTime() <= now.getTime()) continue;

        const fixtureOdds = odds[match.id];
        const reason = prediction.drivers[0] ?? null;

        for (const market of allowed) {
            if (market === 'draw' && !opts.onlyMarket) continue; // never auto-pick the draw
            const prob = MARKET_PROB[market](prediction);
            if (prob == null || prob < req.minProbability || prob >= 1) continue;

            const book = fixtureOdds?.markets[market as keyof FixtureOdds['markets']] ?? null;
            const effectiveOdds = book ?? fairOdds(prob);
            const edge = book != null ? prob * book - 1 : null;

            out.push({
                matchId: match.id,
                league: match.league,
                leagueName: match.leagueName,
                kickoff: match.kickoff,
                homeTeam: match.home.team.shortName,
                awayTeam: match.away.team.shortName,
                market,
                pick: pickLabel(market, match.home.team.shortName, match.away.team.shortName),
                modelProbability: prob,
                fairOdds: fairOdds(prob),
                bookOdds: book,
                oddsSource: book != null ? (fixtureOdds?.source ?? 'consensus') : 'model',
                bookmaker: book != null ? (fixtureOdds?.bookmaker ?? null) : null,
                effectiveOdds,
                edge,
                confidence: prediction.confidence,
                dataQuality: prediction.dataQuality,
                autoGradable: AUTO_GRADABLE[market],
                reason,
            });
        }
    }

    return out;
}

/** Ranking score for a selection under a risk preset (higher = picked first). */
export function selectionScore(s: Selection, rank: 'probability' | 'edge'): number {
    if (rank === 'edge') {
        // Fall back to probability when there's no book odds to judge value from.
        return s.edge ?? s.modelProbability - 1;
    }
    return s.modelProbability;
}
