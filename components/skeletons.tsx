export function MatchCardSkeleton() {
    return (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
            <div className="flex justify-between">
                <span className="skeleton h-3 w-24" />
                <span className="skeleton h-3 w-28" />
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <span className="skeleton h-5 w-full" />
                <span className="skeleton h-6 w-10" />
                <span className="skeleton h-5 w-full" />
            </div>
            <span className="skeleton mt-4 block h-2 w-full rounded-full" />
            <div className="mt-3 flex gap-2">
                <span className="skeleton h-5 w-32 rounded-full" />
                <span className="skeleton h-5 w-20 rounded-full" />
            </div>
            <span className="skeleton mt-4 block h-3 w-40" />
        </div>
    );
}

export function MatchGridSkeleton() {
    return (
        <div className="space-y-4" aria-hidden>
            <div className="skeleton h-16 w-full rounded-[var(--radius-card)]" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <MatchCardSkeleton key={i} />
                ))}
            </div>
        </div>
    );
}
