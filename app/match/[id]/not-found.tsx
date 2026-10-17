import Link from 'next/link';

export default function MatchNotFound() {
    return (
        <div className="mx-auto max-w-lg space-y-3 rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center">
            <h1 className="text-base font-semibold">This fixture isn’t in the upcoming slate</h1>
            <p className="text-sm text-text-dim">
                It may already have kicked off. Finished matches are graded on the{' '}
                <Link href="/accuracy" className="text-accent underline-offset-2 hover:underline">
                    accuracy record
                </Link>
                .
            </p>
            <Link
                href="/"
                className="inline-block rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-dim transition-colors hover:border-border-strong hover:text-text"
            >
                Back to fixtures
            </Link>
        </div>
    );
}
