'use client';

export type DateBucket = 'all' | 'today' | 'tomorrow' | '3d' | 'week';
export type SortKey =
    | 'kickoff'
    | 'confidence'
    | 'over15'
    | 'over25'
    | 'over35'
    | 'btts'
    | 'corners95'
    | 'corners105';

export interface Filters {
    league: string;
    date: DateBucket;
    sort: SortKey;
    expandAll: boolean;
}

/** Sorts that produce a meaningful 1..N ranking (probability-based). */
export const RANKED_SORTS: SortKey[] = [
    'confidence',
    'over15',
    'over25',
    'over35',
    'btts',
    'corners95',
    'corners105',
];

export const MARKET_LABEL: Record<SortKey, string> = {
    kickoff: 'Kick-off',
    confidence: 'Confidence',
    over15: 'Over 1.5',
    over25: 'Over 2.5',
    over35: 'Over 3.5',
    btts: 'BTTS',
    corners95: 'Over 9.5 corners',
    corners105: 'Over 10.5 corners',
};

const DATE_OPTIONS: { value: DateBucket; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'today', label: 'Today' },
    { value: 'tomorrow', label: 'Tomorrow' },
    { value: '3d', label: 'Next 3 days' },
    { value: 'week', label: 'This week' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'kickoff', label: 'Kick-off' },
    { value: 'confidence', label: 'Confidence' },
    { value: 'over15', label: 'Over 1.5' },
    { value: 'over25', label: 'Over 2.5' },
    { value: 'over35', label: 'Over 3.5' },
    { value: 'btts', label: 'BTTS' },
    { value: 'corners95', label: 'Corners 9.5' },
    { value: 'corners105', label: 'Corners 10.5' },
];

function SegGroup<T extends string>({
    legend,
    value,
    options,
    onChange,
}: {
    legend: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (v: T) => void;
}) {
    return (
        <fieldset className="min-w-0">
            <legend className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">
                {legend}
            </legend>
            <div className="flex flex-wrap gap-1">
                {options.map((o) => {
                    const active = o.value === value;
                    return (
                        <button
                            key={o.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onChange(o.value)}
                            className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
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

export function FilterBar({
    filters,
    leagues,
    onChange,
}: {
    filters: Filters;
    leagues: { code: string; name: string }[];
    onChange: (next: Filters) => void;
}) {
    return (
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-3">
            <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">
                    League
                </legend>
                <select
                    value={filters.league}
                    onChange={(e) => onChange({ ...filters, league: e.target.value })}
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-sm text-text"
                >
                    <option value="all">All leagues</option>
                    {leagues.map((l) => (
                        <option key={l.code} value={l.code}>
                            {l.name}
                        </option>
                    ))}
                </select>
            </fieldset>

            <SegGroup
                legend="When"
                value={filters.date}
                options={DATE_OPTIONS}
                onChange={(date) => onChange({ ...filters, date })}
            />

            <SegGroup
                legend="Sort by"
                value={filters.sort}
                options={SORT_OPTIONS}
                onChange={(sort) => onChange({ ...filters, sort })}
            />

            <fieldset className="min-w-0">
                <legend className="mb-1.5 text-[11px] uppercase tracking-wide text-text-faint">
                    Details
                </legend>
                <button
                    type="button"
                    aria-pressed={filters.expandAll}
                    onClick={() => onChange({ ...filters, expandAll: !filters.expandAll })}
                    className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
                        filters.expandAll
                            ? 'border-accent/40 bg-accent/10 text-text'
                            : 'border-border bg-surface text-text-dim hover:border-border-strong hover:text-text'
                    }`}
                >
                    {filters.expandAll ? 'Markets shown' : 'Show all markets'}
                </button>
            </fieldset>
        </div>
    );
}
