// Ad-hoc connectivity check for the Upstash/Vercel KV store.
// Run: node --env-file=.env.local scripts/kv-check.mjs
import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
    console.error('Missing KV_REST_API_URL / KV_REST_API_TOKEN');
    process.exit(1);
}
console.log('URL   :', url);
console.log('token :', token.slice(0, 6) + '…' + token.slice(-4), `(len ${token.length})`);

const redis = new Redis({ url, token });
const key = `kvcheck:${Date.now()}`;

try {
    await redis.set(key, { hello: 'predicta', n: 1 }, { ex: 60 });
    const got = await redis.get(key);
    const n1 = await redis.incr(`${key}:counter`);
    const n2 = await redis.incr(`${key}:counter`);
    await redis.sadd(`${key}:set`, 'a', 'b', 'a');
    const members = await redis.smembers(`${key}:set`);
    await redis.del(key, `${key}:counter`, `${key}:set`);

    console.log('\nround-trip:');
    console.log('  get   ->', JSON.stringify(got));
    console.log('  incr  ->', n1, n2);
    console.log('  smembers ->', JSON.stringify(members.sort()));
    console.log('\n✅ KV store is reachable and read/write works.');
} catch (err) {
    console.error('\n❌ KV call failed:', err?.message || err);
    process.exit(1);
}
