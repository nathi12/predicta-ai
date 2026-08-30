// lib/slip/format.ts
// Small pure helpers shared by the slip builder and its UI.

import type { BetSlip, Selection, SlipDateBucket } from './types';

/** Product of a list, 1 for the empty list. */
export function product(xs: number[]): number {
    return xs.reduce((a, b) => a * b, 1);
}

export const impliedProbability = (decimalOdds: number): number =>
    decimalOdds > 0 ? 1 / decimalOdds : 0;

export const fairOdds = (probability: number): number =>
    probability > 0 ? 1 / probability : Infinity;

/** Return for a stake at the given decimal odds (stake included). */
export const potentialReturn = (stake: number, decimalOdds: number): number => stake * decimalOdds;

export const formatOdds = (decimalOdds: number | null): string =>
    decimalOdds == null || !Number.isFinite(decimalOdds) ? '—' : decimalOdds.toFixed(2);

export const formatPct = (p: number): string => `${Math.round(p * 100)}%`;

export const formatSignedPct = (p: number): string =>
    `${p >= 0 ? '+' : ''}${(p * 100).toFixed(1)}%`;

/** Days from local midnight-today to the fixture's kickoff. */
export function daysAhead(kickoff: string, now = new Date()): number {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = new Date(kickoff).getTime() - start.getTime();
    return Math.floor(diff / 86_400_000);
}

export function withinBucket(kickoff: string, bucket: SlipDateBucket, now = new Date()): boolean {
    const d = daysAhead(kickoff, now);
    switch (bucket) {
        case 'today':
            return d === 0;
        case 'tomorrow':
            return d <= 1 && d >= 0;
        case '3d':
            return d >= 0 && d < 3;
        case 'week':
            return d >= 0 && d < 7;
    }
}

/** A plain-text rendering of a slip, for the "copy" button. */
export function slipToText(slip: BetSlip, heading = 'PredictaAI slip'): string {
    const lines: string[] = [heading];
    slip.legs.forEach((leg, i) => {
        const odds = formatOdds(leg.bookOdds ?? leg.fairOdds);
        const kickoff = new Date(leg.kickoff).toISOString().slice(0, 16).replace('T', ' ');
        lines.push(
            `${i + 1}. ${leg.homeTeam} v ${leg.awayTeam} (${leg.leagueName}, ${kickoff} UTC) — ${leg.pick} @ ${odds}`,
        );
    });
    const combined = formatOdds(slip.combinedBookOdds ?? slip.combinedFairOdds);
    lines.push(
        `Combined ${combined} · model ${formatPct(slip.combinedModelProbability)}` +
            (slip.combinedEdge != null ? ` · edge ${formatSignedPct(slip.combinedEdge)}` : ''),
    );
    lines.push('Not betting advice — probabilities only. begambleaware.org');
    return lines.join('\n');
}

/** One-per-match: keep only the best selection for each fixture, order preserved. */
export function oneLegPerMatch(selections: Selection[]): Selection[] {
    const seen = new Set<string>();
    const out: Selection[] = [];
    for (const s of selections) {
        if (seen.has(s.matchId)) continue;
        seen.add(s.matchId);
        out.push(s);
    }
    return out;
}
