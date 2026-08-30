'use client';

import { useMemo, useState } from 'react';
import type { FixtureOdds, MatchWithPrediction } from '@/types';
import { buildSlip } from '@/lib/slip/build';
import { enumerateSelections } from '@/lib/slip/selections';
import { formatOdds, formatPct } from '@/lib/slip/format';
import { DEFAULT_REQUEST, MARKET_LABEL, type SlipRequest } from '@/lib/slip/types';
import { SlipControls } from './SlipControls';
import { SlipCard } from './SlipCard';

export function SlipBuilder({
    matches,
    odds,
}: {
    matches: MatchWithPrediction[];
    odds: Record<string, FixtureOdds>;
}) {
    const [req, setReq] = useState<SlipRequest>(DEFAULT_REQUEST);

    const leagues = useMemo(() => {
        const seen = new Map<string, string>();
        for (const m of matches) seen.set(m.match.league, m.match.leagueName);
        return [...seen.entries()]
            .map(([code, name]) => ({ code, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [matches]);

    const selections = useMemo(
        () =>
            enumerateSelections(
                matches,
                odds,
                req,
                req.mode === 'single-market' ? { onlyMarket: req.market } : {},
            ),
        [matches, odds, req],
    );

    const slip = useMemo(() => buildSlip(selections, req), [selections, req]);

    const alternatives = useMemo(() => {
        const usedMatch = new Set(slip.legs.map((l) => l.matchId));
        return [...selections]
            .filter((s) => !usedMatch.has(s.matchId))
            .sort((a, b) => b.modelProbability - a.modelProbability)
            .filter((s, i, arr) => arr.findIndex((x) => x.matchId === s.matchId) === i)
            .slice(0, 6);
    }, [selections, slip]);

    const heading =
        req.mode === 'target-odds'
            ? `Target ~${req.targetOdds.toFixed(2)} · ${req.risk}`
            : `${MARKET_LABEL[req.market]} · ${req.legs} legs`;

    const oddsCoverage = Object.keys(odds).length;

    return (
        <div className="space-y-4">
            <SlipControls req={req} leagues={leagues} onChange={setReq} />

            <p className="text-xs text-text-faint" aria-live="polite">
                {matches.length} fixtures loaded · live odds for {oddsCoverage}
                {oddsCoverage === 0 &&
                    ' — set a direct API_FOOTBALL_KEY for real prices; fair odds shown meanwhile'}
            </p>

            <SlipCard slip={slip} heading={heading} />

            {alternatives.length > 0 && (
                <details className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
                    <summary className="cursor-pointer list-none text-xs font-medium text-text-dim hover:text-text">
                        Other selections considered ({alternatives.length})
                    </summary>
                    <ul className="mt-3 divide-y divide-border">
                        {alternatives.map((s) => (
                            <li
                                key={`${s.matchId}-${s.market}`}
                                className="flex items-center justify-between gap-3 py-2 text-sm"
                            >
                                <span className="truncate text-text-dim">
                                    {s.homeTeam} v {s.awayTeam} — {s.pick}
                                </span>
                                <span className="flex shrink-0 items-center gap-2.5">
                                    <span className="tabular text-text-faint">
                                        {formatPct(s.modelProbability)}
                                    </span>
                                    <span className="tabular">
                                        {formatOdds(s.bookOdds ?? s.fairOdds)}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
