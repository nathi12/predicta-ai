// lib/kv.ts
// Thin cache/store wrapper over Upstash Redis (a.k.a. Vercel KV).
// In development, or when KV credentials are absent, it transparently falls
// back to an in-process Map mirrored to a gitignored .cache/ directory so the
// whole app works locally with zero setup.

import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Redis } from '@upstash/redis';
import { KV_REST_API_TOKEN, KV_REST_API_URL, hasKV } from './env';

interface Store {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    /** Atomic increment; sets an expiry on first write. Returns the new value. */
    incr(key: string, ttlSeconds: number): Promise<number>;
    sadd(key: string, member: string): Promise<void>;
    srem(key: string, member: string): Promise<void>;
    smembers(key: string): Promise<string[]>;
}

// --- Upstash-backed store -------------------------------------------------

function redisStore(): Store {
    const redis = new Redis({ url: KV_REST_API_URL, token: KV_REST_API_TOKEN });
    return {
        async get<T>(key: string) {
            return (await redis.get<T>(key)) ?? null;
        },
        async set<T>(key: string, value: T, ttlSeconds?: number) {
            if (ttlSeconds) await redis.set(key, value, { ex: ttlSeconds });
            else await redis.set(key, value);
        },
        async del(key: string) {
            await redis.del(key);
        },
        async incr(key: string, ttlSeconds: number) {
            const n = await redis.incr(key);
            if (n === 1) await redis.expire(key, ttlSeconds);
            return n;
        },
        async sadd(key: string, member: string) {
            await redis.sadd(key, member);
        },
        async srem(key: string, member: string) {
            await redis.srem(key, member);
        },
        async smembers(key: string) {
            return (await redis.smembers(key)) as string[];
        },
    };
}

// --- Filesystem / in-memory fallback ------------------------------------

interface Entry {
    value: unknown;
    expiresAt: number | null;
}

function fileStore(): Store {
    const dir = path.join(process.cwd(), '.cache');
    const file = path.join(dir, 'kv.json');
    const mem = new Map<string, Entry>();
    let loaded = false;

    async function load() {
        if (loaded) return;
        loaded = true;
        try {
            const raw = await fs.readFile(file, 'utf8');
            for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, Entry>)) {
                mem.set(k, v);
            }
        } catch {
            /* first run */
        }
    }

    let writeChain: Promise<void> = Promise.resolve();
    function scheduleSave() {
        // Serialise writes; each resolves only once flushed to disk so a
        // short-lived process (next build) can't exit mid-write.
        writeChain = writeChain.then(async () => {
            try {
                await fs.mkdir(dir, { recursive: true });
                await fs.writeFile(file, JSON.stringify(Object.fromEntries(mem)), 'utf8');
            } catch {
                /* best effort */
            }
        });
        return writeChain;
    }

    function live(key: string): Entry | null {
        const e = mem.get(key);
        if (!e) return null;
        if (e.expiresAt && Date.now() > e.expiresAt) {
            mem.delete(key);
            return null;
        }
        return e;
    }

    return {
        async get<T>(key: string) {
            await load();
            return (live(key)?.value as T) ?? null;
        },
        async set<T>(key: string, value: T, ttlSeconds?: number) {
            await load();
            mem.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
            await scheduleSave();
        },
        async del(key: string) {
            await load();
            mem.delete(key);
            await scheduleSave();
        },
        async incr(key: string, ttlSeconds: number) {
            await load();
            const current = (live(key)?.value as number) ?? 0;
            const next = current + 1;
            const expiresAt = live(key)?.expiresAt ?? Date.now() + ttlSeconds * 1000;
            mem.set(key, { value: next, expiresAt });
            await scheduleSave();
            return next;
        },
        async sadd(key: string, member: string) {
            await load();
            const set = new Set<string>((live(key)?.value as string[]) ?? []);
            set.add(member);
            mem.set(key, { value: [...set], expiresAt: null });
            await scheduleSave();
        },
        async srem(key: string, member: string) {
            await load();
            const set = new Set<string>((live(key)?.value as string[]) ?? []);
            set.delete(member);
            mem.set(key, { value: [...set], expiresAt: null });
            await scheduleSave();
        },
        async smembers(key: string) {
            await load();
            return [...((live(key)?.value as string[]) ?? [])];
        },
    };
}

// Reuse one store across hot-reloads / serverless invocations in a process.
const globalForKv = globalThis as unknown as { __predictaStore?: Store };
export const store: Store = globalForKv.__predictaStore ?? (hasKV() ? redisStore() : fileStore());
globalForKv.__predictaStore = store;

/**
 * Get `key` from the store, or compute it with `fetcher`, cache it for
 * `ttlSeconds`, and return it. A failed fetch falls back to any stale value
 * still in memory rather than throwing.
 */
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const hit = await store.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
    const fresh = await fetcher();
    await store.set(key, fresh, ttlSeconds);
    return fresh;
}
