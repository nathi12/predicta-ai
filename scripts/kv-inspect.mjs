// Peek at what the app wrote to KV.
// Run: node --env-file=.env.local scripts/kv-inspect.mjs
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
});

const keys = [];
let cursor = '0';
do {
    const [next, batch] = await redis.scan(cursor, { count: 200 });
    cursor = next;
    keys.push(...batch);
} while (cursor !== '0');

const groups = {};
for (const k of keys) {
    const g = k.split(':').slice(0, 2).join(':');
    groups[g] = (groups[g] || 0) + 1;
}
console.log(`total keys: ${keys.length}\n`);
console.table(groups);

const matches = await redis.get('matches:v7');
console.log('\nmatches:v7 ->', Array.isArray(matches) ? `${matches.length} fixtures` : matches);

const pending = await redis.smembers('pred:pending');
console.log('pred:pending ->', pending.length, 'ids');

const cornersPending = await redis.smembers('pred:corners:pending');
console.log('pred:corners:pending ->', cornersPending.length, 'ids');

const stats = await redis.get('stats:rolling');
console.log('stats:rolling ->', stats ? `${stats.outcome?.n ?? 0} graded` : 'none yet (expected)');

const cornerRates = await redis.get('corners:rates:v2');
console.log(
    'corners:rates:v2 ->',
    cornerRates ? `${Object.keys(cornerRates).length} teams with history` : 'none yet (expected)',
);

const backfillQueue = await redis.smembers('corners:backfill:queue');
console.log('corners:backfill:queue ->', backfillQueue.length, 'teams awaiting backfill');
