/** Placeholder with the same `.match-row` geometry as a real row. */
function MatchRowSkeleton() {
    return (
        <div className="match-row px-3 py-3 max-lg:rounded-[var(--radius-card)] max-lg:border max-lg:border-border max-lg:bg-surface lg:py-2.5">
            <span className="skeleton h-4 w-12 [grid-area:when]" />
            <span className="skeleton h-4 w-32 [grid-area:home]" />
            <span className="skeleton h-4 w-14 [grid-area:p1]" />
            <span className="skeleton h-4 w-28 [grid-area:away]" />
            <span className="skeleton h-4 w-14 [grid-area:p2]" />
            <div className="match-strip">
                <span className="skeleton h-4 w-14 lg:[grid-area:px]" />
                <span className="skeleton h-4 w-14 lg:[grid-area:o25]" />
                <span className="skeleton h-4 w-14 lg:[grid-area:btts]" />
            </div>
            <span className="skeleton h-3 w-16 justify-self-end [grid-area:conf] lg:justify-self-start" />
        </div>
    );
}

export function FixtureListSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <div className="flex flex-wrap gap-2">
                <span className="skeleton h-8 w-full max-w-sm" />
                <span className="skeleton h-8 w-44" />
                <span className="skeleton h-8 w-40" />
            </div>
            <span className="skeleton block h-4 w-full max-w-md" />
            <div className="match-grid space-y-2">
                <span className="skeleton mx-3 block h-3 w-36" />
                <div className="space-y-2 lg:space-y-0 lg:divide-y lg:divide-border lg:overflow-hidden lg:rounded-[var(--radius-card)] lg:border lg:border-border lg:bg-surface">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <MatchRowSkeleton key={i} />
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Bet-slip builder: the controls panel over one slip card. */
export function SlipSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <span className="skeleton block h-28 w-full rounded-[var(--radius-card)]" />
            <div className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-4">
                <span className="skeleton block h-4 w-40" />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <span key={i} className="skeleton block h-16" />
                    ))}
                </div>
                {Array.from({ length: 4 }).map((_, i) => (
                    <span key={i} className="skeleton block h-10 w-full" />
                ))}
            </div>
        </div>
    );
}

export function MatchDetailSkeleton() {
    return (
        <div className="space-y-6" aria-hidden>
            <span className="skeleton block h-4 w-28" />
            <div className="space-y-6 rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <span className="skeleton block h-3 w-64 max-w-full" />
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <span className="skeleton h-14 w-full" />
                    <span className="skeleton h-14 w-20" />
                    <span className="skeleton h-14 w-full" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <span className="skeleton h-20" />
                    <span className="skeleton h-20" />
                    <span className="skeleton h-20" />
                </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
                <span className="skeleton block h-72 rounded-[var(--radius-card)]" />
                <span className="skeleton block h-72 rounded-[var(--radius-card)]" />
            </div>
        </div>
    );
}
