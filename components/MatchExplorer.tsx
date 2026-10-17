'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { FixtureSummary } from '@/lib/fixtures/summary';
import {
    dayLabel,
    DEFAULT_FILTERS,
    focusColumn,
    groupByDay,
    isRanked,
    MARKET_LABEL,
    MARKET_SHORT,
    selectFixtures,
    type Filters,
    type SortKey,
} from '@/lib/fixtures/view';
import { FilterBar, ResetButton } from './FilterBar';
import { MatchRow } from './MatchRow';
import { ProbLegend } from './primitives';
import { useLocalDay } from './useLocalDay';

/** Section heading plus, on lg, the column labels the rows align to. */
function SectionHead({ id, title, sort }: { id: string; title: string; sort: SortKey }) {
    const focus = focusColumn(sort);
    const col = (on: boolean) =>
        `hidden text-[11px] uppercase tracking-wide lg:block ${on ? 'font-semibold text-text' : 'text-text-faint'}`;
    return (
        <div className="match-head px-3 pb-2">
            <h2 id={id} className="text-xs font-medium uppercase tracking-wide text-text-dim lg:[grid-area:label]">
                {title}
            </h2>
            <span aria-hidden className={`${col(false)} lg:[grid-area:p1]`}>
                1
            </span>
            <span aria-hidden className={`${col(false)} lg:[grid-area:px]`}>
                X
            </span>
            <span aria-hidden className={`${col(false)} lg:[grid-area:p2]`}>
                2
            </span>
            <span aria-hidden className={`${col(focus === 'o25')} lg:[grid-area:o25]`} title="Over 2.5 goals">
                O2.5
            </span>
            <span aria-hidden className={`${col(focus === 'btts')} lg:[grid-area:btts]`} title="Both teams score">
                BTTS
            </span>
            {focus === 'extra' && (
                <span aria-hidden className={`${col(true)} lg:[grid-area:focus]`} title={MARKET_LABEL[sort]}>
                    {MARKET_SHORT[sort]}
                </span>
            )}
            <span
                aria-hidden
                className={`${col(focus === 'conf')} lg:[grid-area:conf]`}
                title="Model confidence — forecast sharpness × data quality"
            >
                Confidence
            </span>
        </div>
    );
}

function FixtureSection({
    id,
    title,
    sort,
    children,
}: {
    id: string;
    title: string;
    sort: SortKey;
    children: ReactNode;
}) {
    return (
        <section aria-labelledby={id}>
            <SectionHead id={id} title={title} sort={sort} />
            <ul className="space-y-2 lg:space-y-0 lg:divide-y lg:divide-border lg:overflow-hidden lg:rounded-[var(--radius-card)] lg:border lg:border-border lg:bg-surface">
                {children}
            </ul>
        </section>
    );
}

export function MatchExplorer({ fixtures }: { fixtures: FixtureSummary[] }) {
    const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
    const { tz, today } = useLocalDay();

    const leagues = useMemo(() => {
        const seen = new Map<string, string>();
        for (const f of fixtures) seen.set(f.league, f.leagueName);
        return [...seen.entries()]
            .map(([code, name]) => ({ code, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [fixtures]);

    const visible = useMemo(
        () => selectFixtures(fixtures, filters, tz, today),
        [fixtures, filters, tz, today],
    );

    const ranked = isRanked(filters.sort);
    const groups = useMemo(() => (ranked ? [] : groupByDay(visible, tz)), [ranked, visible, tz]);
    const enrichedCount = useMemo(
        () => visible.filter((f) => f.dataQuality === 'enriched').length,
        [visible],
    );

    const rankedTitle =
        filters.sort === 'confidence'
            ? 'Ranked by model confidence'
            : `Ranked by ${MARKET_LABEL[filters.sort]} probability`;

    return (
        <div className="space-y-4">
            <FilterBar filters={filters} leagues={leagues} onChange={setFilters} />

            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-t border-border pt-3">
                <p className="text-xs text-text-faint" aria-live="polite">
                    {visible.length} {visible.length === 1 ? 'match' : 'matches'}
                    {!filters.enrichedOnly && enrichedCount > 0 && <> · {enrichedCount} enriched</>}
                    {ranked && <> · most likely first</>}
                </p>
                <ProbLegend />
            </div>

            {visible.length === 0 ? (
                <div className="space-y-2 rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center text-sm text-text-dim">
                    <p>No fixtures match these filters.</p>
                    <ResetButton onClick={() => setFilters(DEFAULT_FILTERS)} />
                </div>
            ) : (
                <div
                    className="match-grid space-y-6"
                    data-ranked={ranked ? '' : undefined}
                    data-extra={focusColumn(filters.sort) === 'extra' ? '' : undefined}
                >
                    {ranked ? (
                        <FixtureSection id="fixtures-ranked" title={rankedTitle} sort={filters.sort}>
                            {visible.map((f, i) => (
                                <li key={f.id}>
                                    <MatchRow fixture={f} sort={filters.sort} rank={i + 1} />
                                </li>
                            ))}
                        </FixtureSection>
                    ) : (
                        groups.map((g) => {
                            const { relative, date } = dayLabel(g.key, today);
                            return (
                                <FixtureSection
                                    key={g.key}
                                    id={`day-${g.key}`}
                                    title={relative ? `${relative} · ${date}` : date}
                                    sort={filters.sort}
                                >
                                    {g.rows.map((f) => (
                                        <li key={f.id}>
                                            <MatchRow fixture={f} sort={filters.sort} />
                                        </li>
                                    ))}
                                </FixtureSection>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
