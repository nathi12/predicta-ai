import { before, test } from 'node:test';
import assert from 'node:assert/strict';

import { importIsolated } from './isolated';

type Kv = typeof import('@/lib/kv');
type Flight = typeof import('@/lib/flight');

let kv: Kv;
let flight: Flight;

before(async () => {
    kv = await importIsolated<Kv>('lib/kv.ts');
    flight = await importIsolated<Flight>('lib/flight.ts');
});

test('file store: mget keeps order and returns null for misses', async () => {
    await kv.store.set('mget:a', { v: 1 });
    await kv.store.set('mget:c', 'three');
    assert.deepEqual(await kv.store.mget(['mget:a', 'mget:b', 'mget:c']), [{ v: 1 }, null, 'three']);
    assert.deepEqual(await kv.store.mget([]), []);
});

test('file store: setnx only writes when the key is absent', async () => {
    assert.equal(await kv.store.setnx('nx', 'first', 60), true);
    assert.equal(await kv.store.setnx('nx', 'second', 60), false);
    assert.equal(await kv.store.get('nx'), 'first');
});

test('file store: incr is a claim — only the first caller sees 1', async () => {
    assert.equal(await kv.store.incr('claim', 60), 1);
    assert.equal(await kv.store.incr('claim', 60), 2);
});

test('tryLock: exclusive until released', async () => {
    const release = await kv.tryLock('lock:a', 60);
    assert.ok(release);
    assert.equal(await kv.tryLock('lock:a', 60), null);
    await release();
    const again = await kv.tryLock('lock:a', 60);
    assert.ok(again);
    await again();
});

test('tryLock: a stale holder never releases a lock someone else now holds', async () => {
    const stale = await kv.tryLock('lock:b', 60);
    assert.ok(stale);
    await kv.store.del('lock:b'); // as if its TTL ran out mid-run
    const current = await kv.tryLock('lock:b', 60);
    assert.ok(current);
    await stale(); // must be a no-op
    assert.equal(await kv.tryLock('lock:b', 60), null, 'current holder keeps the lock');
    await current();
});

test('singleFlight: concurrent callers share one run; the next call runs afresh', async () => {
    let runs = 0;
    const work = () =>
        flight.singleFlight('job', async () => {
            runs++;
            await new Promise((r) => setTimeout(r, 10));
            return runs;
        });
    const [a, b] = await Promise.all([work(), work()]);
    assert.equal(runs, 1);
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(await work(), 2);
});
