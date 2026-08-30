// lib/log.ts
// Minimal leveled logger. Quiet in production, plain text in development —
// no emoji, no noise in hot paths.

const enabled = process.env.NODE_ENV !== 'production' || process.env.PREDICTA_DEBUG === '1';

export const log = {
    debug: (...args: unknown[]) => {
        if (enabled) console.log('[predicta]', ...args);
    },
    warn: (...args: unknown[]) => {
        console.warn('[predicta]', ...args);
    },
    error: (...args: unknown[]) => {
        console.error('[predicta]', ...args);
    },
};
