import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BoundedLruCache, metadataCache } from '../src/lib/cache/lruCache.ts';

describe('BoundedLruCache', () => {
  it('stores and retrieves values and updates LRU order', () => {
    const cache = new BoundedLruCache<number>({ maxEntries: 3, ttlMs: 60_000 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    // Access 'a' so 'b' becomes the least-recently-used entry
    assert.equal(cache.get('a'), 1);

    // Adding 'd' should evict 'b'
    cache.set('d', 4);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('c'), 3);
    assert.equal(cache.get('d'), 4);
  });

  it('expires entries after TTL', async () => {
    const cache = new BoundedLruCache<string>({ maxEntries: 10, ttlMs: 25 });
    cache.set('ephemeral', 'hello');
    assert.equal(cache.get('ephemeral'), 'hello');

    await new Promise((r) => setTimeout(r, 40));
    assert.equal(cache.get('ephemeral'), undefined);
  });

  it('enforces maxBytes budget by evicting oldest entries', () => {
    const cache = new BoundedLruCache<string>({ maxEntries: 100, maxBytes: 500, ttlMs: 60_000 });
    cache.set('k1', 'x'.repeat(120)); // ~240 bytes
    cache.set('k2', 'y'.repeat(120)); // ~240 bytes
    assert.equal(cache.size, 2);

    // Adding k3 exceeds 500 bytes, so k1 must be evicted
    cache.set('k3', 'z'.repeat(120));
    assert.equal(cache.get('k1'), undefined);
    assert.ok(cache.totalBytes <= 500);
  });

  it('evicts keys matching a prefix and cleans up connection metadata', () => {
    metadataCache.clearAll();
    metadataCache.tables.set('conn-1:public', [{ name: 'users', count: '10' }]);
    metadataCache.tables.set('conn-2:public', [{ name: 'orders', count: '20' }]);
    metadataCache.schemas.set('conn-1:public:users', { columns: [] });
    metadataCache.databases.set('conn-1:databases', ['postgres', 'ecom']);

    metadataCache.evictConnection('conn-1');

    assert.equal(metadataCache.tables.get('conn-1:public'), undefined);
    assert.equal(metadataCache.schemas.get('conn-1:public:users'), undefined);
    assert.equal(metadataCache.databases.get('conn-1:databases'), undefined);
    assert.deepEqual(metadataCache.tables.get('conn-2:public'), [{ name: 'orders', count: '20' }]);
  });

  it('deduplicates concurrent in-flight getOrFetch requests', async () => {
    const cache = new BoundedLruCache<string[]>({ maxEntries: 10, ttlMs: 60_000 });
    let fetchCount = 0;

    const fetcher = async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 20));
      return ['db1', 'db2', 'db3'];
    };

    const [r1, r2, r3, r4] = await Promise.all([
      cache.getOrFetch('conn-aurora:databases', fetcher),
      cache.getOrFetch('conn-aurora:databases', fetcher),
      cache.getOrFetch('conn-aurora:databases', fetcher),
      cache.getOrFetch('conn-aurora:databases', fetcher),
    ]);

    assert.equal(fetchCount, 1);
    assert.deepEqual(r1, ['db1', 'db2', 'db3']);
    assert.deepEqual(r2, r1);
    assert.deepEqual(r3, r1);
    assert.deepEqual(r4, r1);
  });
});
