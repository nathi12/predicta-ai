'use client';

import { useEffect, useState } from 'react';

// Deterministic server render (fixed locale + UTC) so SSR and the first client
// paint match; after mount we swap to the viewer's local time zone.
function formatUTC(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        hour12: false,
    }).format(new Date(iso));
}

function formatLocal(iso: string): string {
    return new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(iso));
}

export function KickoffTime({ iso }: { iso: string }) {
    const [label, setLabel] = useState(() => formatUTC(iso));

    useEffect(() => {
        setLabel(formatLocal(iso));
    }, [iso]);

    return (
        <time dateTime={iso} suppressHydrationWarning>
            {label}
        </time>
    );
}
