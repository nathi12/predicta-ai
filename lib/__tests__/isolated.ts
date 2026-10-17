// Load the app's server-only modules against a throwaway, file-backed KV store.
//
// `npm test` runs node with the `react-server` condition, so `import 'server-only'`
// resolves to its no-op build. Before the first import this helper clears every
// KV / API credential from the environment (lib/kv.ts then picks its file store)
// and moves the process into a fresh temp directory (where that store writes
// .cache/kv.json). node --test runs each test file in its own process, so every
// file gets its own empty store.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CREDENTIALS = [
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'FOOTBALL_DATA_API_KEY',
    'NEXT_PUBLIC_FOOTBALL_DATA_KEY',
    'API_FOOTBALL_KEY',
    'API_SPORTS_KEY',
    'RAPIDAPI_KEY',
    'NEXT_PUBLIC_RAPID_API_KEY',
    'CRON_SECRET',
];

const repoRoot = process.cwd();
let isolated = false;

/** Import a module by its path from the repo root, e.g. `lib/tracking.ts`. */
export async function importIsolated<T>(fromRoot: string): Promise<T> {
    if (!isolated) {
        for (const k of CREDENTIALS) delete process.env[k];
        process.chdir(mkdtempSync(path.join(tmpdir(), 'predicta-test-')));
        isolated = true;
    }
    return (await import(pathToFileURL(path.join(repoRoot, fromRoot)).href)) as T;
}
