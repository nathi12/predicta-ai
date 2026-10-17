'use client';

import { formatKickoff, type KickoffFormat } from '@/lib/fixtures/view';
import { useHydrated, useTimeZone } from './useLocalDay';

/**
 * Kickoff in the viewer's time zone and locale. The server render (and the
 * hydration pass) uses UTC + en-GB so the markup matches, then swaps.
 */
export function KickoffTime({ iso, format = 'full' }: { iso: string; format?: KickoffFormat }) {
    const hydrated = useHydrated();
    const tz = useTimeZone();
    return <time dateTime={iso}>{formatKickoff(iso, format, tz, hydrated ? undefined : 'en-GB')}</time>;
}
