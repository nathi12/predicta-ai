'use client';

import type { ReactNode } from 'react';
import {
    DEFAULT_FILTERS,
    isDefaultFilters,
    MARKET_LABEL,
    type DateBucket,
    type Filters,
    type SortKey,
} from '@/lib/fixtures/view';

const DATE_OPTIONS: { value: DateBucket; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'today', label: 'Today' },
    { value: 'tomorrow', label: 'Tomorrow' },
    { value: '3d', label: '3 days' },
    { value: 'week', label: '7 days' },
];

const PROBABILITY_SORTS: SortKey[] = ['over15', 'over25', 'over35', 'btts', 'corners95', 'corners105'];

const controlClass =
    'rounded-md border border-border bg-surface px-2.5 py-1 text-sm text-text transition-colors hover:border-border-strong';

export function SegGroup<T extends string>({
    legend,
    value,
    options,
    onChange,
    hideLegend = false,
    nowrap = false,
}: {
    legend: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
    /** Keep the legend for screen readers only. */
    hideLegend?: boolean;
    /** One line that scrolls horizontally instead of wrapping. */
    nowrap?: boolean;
}) {
    return (
        <fieldset className="min-w-0">
            <legend
                className={
                    hideLegend ? 'sr-only' : 'mb-1.5 text-[11px] uppercase tracking-wide text-text-faint'
                }
            >
                {legend}
            </legend>
            <div className={`flex gap-1 ${nowrap ? 'flex-nowrap' : 'flex-wrap'}`}>
                {options.map((o) => {
                    const active = o.value === value;
                    return (
                        <button
                            key={o.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onChange(o.value)}
                            className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-sm transition-colors ${
                                active
                                    ? 'border-accent/40 bg-accent/10 text-text'
                                    : 'border-border bg-surface text-text-dim hover:border-border-strong hover:text-text'
                            }`}
                        >
                            {o.label}
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}

function LabeledSelect({
    id,
    label,
    value,
    onChange,
    children,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    children: ReactNode;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            {/* The selected value describes itself on phones; the label stays for screen readers. */}
            <label htmlFor={id} className="text-xs text-text-faint max-sm:sr-only">
                {label}
            </label>
            <select
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`min-w-0 ${controlClass}`}
            >
                {children}
            </select>
        </div>
    );
}

/** Compact fixtures toolbar: date chips, league + sort selects, data toggle. */
export function FilterBar({
    filters,
    leagues,
    onChange,
}: {
    filters: Filters;
    leagues: { code: string; name: string }[];
    onChange: (next: Filters) => void;
}) {
    const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

    return (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            {/* Scrolls inside its own strip on narrow screens, never the page. */}
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <SegGroup
                    legend="Kick-off window"
                    hideLegend
                    nowrap
                    value={filters.date}
                    options={DATE_OPTIONS}
                    onChange={(date) => set({ date })}
                />
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-4">
                <LabeledSelect
                    id="filter-league"
                    label="League"
                    value={filters.league}
                    onChange={(league) => set({ league })}
                >
                    <option value="all">All leagues</option>
                    {leagues.map((l) => (
                        <option key={l.code} value={l.code}>
                            {l.name}
                        </option>
                    ))}
                </LabeledSelect>

                <LabeledSelect
                    id="filter-sort"
                    label="Sort"
                    value={filters.sort}
                    onChange={(sort) => set({ sort: sort as SortKey })}
                >
                    <option value="kickoff">Kick-off</option>
                    <option value="confidence">Confidence</option>
                    <optgroup label="Most likely first">
                        {PROBABILITY_SORTS.map((s) => (
                            <option key={s} value={s}>
                                {MARKET_LABEL[s]}
                            </option>
                        ))}
                    </optgroup>
                </LabeledSelect>

                <button
                    type="button"
                    aria-pressed={filters.enrichedOnly}
                    onClick={() => set({ enrichedOnly: !filters.enrichedOnly })}
                    title="Show only fixtures with API-Football live form + provider signals blended in"
                    className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
                        filters.enrichedOnly
                            ? 'border-accent/40 bg-accent/10 text-text'
                            : 'border-border bg-surface text-text-dim hover:border-border-strong hover:text-text'
                    }`}
                >
                    Enriched only
                </button>

                {!isDefaultFilters(filters) && <ResetButton onClick={() => onChange(DEFAULT_FILTERS)} />}
            </div>
        </div>
    );
}

export function ResetButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="rounded-md px-1.5 py-1 text-sm text-text-dim underline decoration-dotted underline-offset-4 hover:text-text"
        >
            Reset filters
        </button>
    );
}
