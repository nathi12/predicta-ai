'use client';

import { useSyncExternalStore } from 'react';
import { dayKey } from '@/lib/fixtures/view';

// The server renders in UTC with a fixed locale and no notion of "today";
// hydration replays those server snapshots, then React re-renders with the
// viewer's real values. No setState-in-effect, no hydration mismatch.

const subscribeNever = () => () => {};

/** Re-read the calendar day once a minute so "Today" rolls over at midnight. */
function subscribeMinute(onChange: () => void) {
    const t = setInterval(onChange, 60_000);
    return () => clearInterval(t);
}

const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** False during the server render and hydration, true afterwards. */
export function useHydrated(): boolean {
    return useSyncExternalStore(
        subscribeNever,
        () => true,
        () => false,
    );
}

/** The viewer's IANA time zone; 'UTC' until hydrated. */
export function useTimeZone(): string {
    return useSyncExternalStore(subscribeNever, localTimeZone, () => 'UTC');
}

/** The viewer's time zone and today's `YYYY-MM-DD` in it (null until hydrated). */
export function useLocalDay(): { tz: string; today: string | null } {
    const tz = useTimeZone();
    const today = useSyncExternalStore(
        subscribeMinute,
        () => dayKey(new Date(), tz),
        () => null,
    );
    return { tz, today };
}
