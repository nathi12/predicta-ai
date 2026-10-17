// lib/flight.ts
// Shared helpers for the detached cache rebuilds in lib/matchData.ts and
// lib/oddsData.ts. In-process only — pair with tryLock (lib/kv.ts) to stop
// separate serverless instances from rebuilding at the same time.

import 'server-only';
import { after } from 'next/server';

const globalForFlight = globalThis as unknown as {
    __predictaFlights?: Map<string, Promise<unknown>>;
};
const flights = (globalForFlight.__predictaFlights ??= new Map());

/** Concurrent callers for `key` on this instance share one run of `fn`. */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const running = flights.get(key) as Promise<T> | undefined;
    if (running) return running;
    const p = fn().finally(() => flights.delete(key));
    flights.set(key, p);
    return p;
}

/** Extend the serverless invocation until a detached rebuild settles, when possible. */
export function keepAlive(p: Promise<unknown>): void {
    try {
        after(() => p.catch(() => {}));
    } catch {
        // Not in a request scope (script / test) — the promise still runs;
        // swallow its rejection so it isn't unhandled.
        p.catch(() => {});
    }
}
