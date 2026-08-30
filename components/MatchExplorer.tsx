'use client';

import { useMemo, useState } from 'react';
import type { MatchWithPrediction } from '@/types';
import {
    FilterBar,
    MARKET_LABEL,
    RANKED_SORTS,
    type DateBucket,
    type Filters,
    type SortKey,
} from './FilterBar';
import { MatchCard } from './MatchCard';

function inBucket(kickoff: string, bucket: DateBucket): boolean {
    if (bucket === 'all') return true;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const k = new Date(kickoff);
    const dayMs = 86_400_000;
    const diffDays = Math.floor((k.getTime() - start.getTime()) / dayMs);
    switch (bucket) {
        case 'today':
            return diffDays === 0;
        case 'tomorrow':
            return diffDays === 1;
        case '3d':
            return diffDays >= 0 && diffDays < 3;
        case 'week':
            return diffDays >= 0 && diffDays < 7;
    }
}

function sortValue(m: MatchWithPrediction, key: SortKey): number {
    const g = m.prediction.markets;
    switch (key) {
        case 'confidence':
            return m.prediction.confidence;
        case 'over15':
            return g.over15.probability;
        case 'over25':
            return g.over25.probability;
        case 'over35':
            return g.over35.probability;
        case 'btts':
            return g.btts.probability;
        case 'corners95':
            return g.corners?.over95.probability ?? -1;
        case 'corners105':
            return g.corners?.over105.probability ?? -1;
        default:
            return 0;
    }
}

export function MatchExplorer({ matches }: { matches: MatchWithPrediction[] }) {
    const [filters, setFilters] = useState<Filters>({
        league: 'all',
        date: 'all',
        sort: 'kickoff',
        expandAll: false,
    });

    const leagues = useMemo(() => {
        const seen = new Map<string, string>();
        for (const m of matches) seen.set(m.match.league, m.match.leagueName);
        return [...seen.entries()]
            .map(([code, name]) => ({ code, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [matches]);

    const ranked = RANKED_SORTS.includes(filters.sort);

    const visible = useMemo(() => {
        const filtered = matches.filter(
            (m) =>
                (filters.league === 'all' || m.match.league === filters.league) &&
                inBucket(m.match.kickoff, filters.date),
        );
        return [...filtered].sort((a, b) => {
            if (filters.sort === 'kickoff') {
                return a.match.kickoff.localeCompare(b.match.kickoff);
            }
            const diff = sortValue(b, filters.sort) - sortValue(a, filters.sort);
            return diff !== 0 ? diff : a.match.kickoff.localeCompare(b.match.kickoff);
        });
    }, [matches, filters]);

    return (
        <div className="space-y-4">
            <FilterBar filters={filters} leagues={leagues} onChange={setFilters} />

            <p className="text-xs text-text-faint" aria-live="polite">
                {visible.length} {visible.length === 1 ? 'match' : 'matches'}
                {ranked && <> · ranked by {MARKET_LABEL[filters.sort]} probability</>}
            </p>

            {visible.length === 0 ? (
                <div className="rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center text-sm text-text-dim">
                    No fixtures match these filters.
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {visible.map((m, i) => (
                        <MatchCard
                            key={m.match.id}
                            {...m}
                            expanded={filters.expandAll}
                            rank={ranked ? i + 1 : undefined}
                            rankMarket={ranked ? filters.sort : undefined}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
