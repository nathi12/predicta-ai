'use client';

import { useEffect } from 'react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className="rounded-[var(--radius-card)] border border-neg/30 bg-neg/5 p-8 text-center">
            <h2 className="text-base font-semibold text-text">Couldn’t load fixtures</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-dim">
                The data provider didn’t respond. This is usually temporary — the free API tier is
                rate-limited. Try again in a moment.
            </p>
            <button
                type="button"
                onClick={reset}
                className="mt-4 rounded-md border border-border-strong bg-surface-2 px-4 py-2 text-sm text-text hover:border-accent/50"
            >
                Retry
            </button>
        </div>
    );
}
