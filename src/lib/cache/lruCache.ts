/**
 * Bounded LRU + TTL Cache with In-Flight Promise Deduplication
 *
 * Prevents unbounded client RAM growth when switching across many connections,
 * databases, and table schemas, while deduplicating concurrent identical requests.
 */

export interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  approxBytes: number;
}

export interface LruCacheOptions {
  maxEntries: number;
  ttlMs: number;
  maxTotalBytes?: number;
  maxBytes?: number;
}

export class BoundedLruCache<V = any> {
  private map = new Map<string, CacheEntry<V>>();
  private inFlight = new Map<string, Promise<V>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly maxTotalBytes: number;
  private currentBytes = 0;

  constructor(options: LruCacheOptions) {
    this.maxEntries = Math.max(1, options.maxEntries);
    this.ttlMs = Math.max(10, options.ttlMs);
    this.maxTotalBytes = options.maxTotalBytes ?? options.maxBytes ?? 16 * 1024 * 1024; // 16 MB default cap
  }

  public get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      return undefined;
    }

    // Refresh LRU order
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  public set(key: string, value: V, customTtlMs?: number): void {
    if (this.map.has(key)) {
      this.delete(key);
    }

    const approxBytes = this.estimateBytes(value);
    // Do not cache single items larger than total cache budget
    if (approxBytes > this.maxTotalBytes) {
      return;
    }

    while (
      this.map.size >= this.maxEntries ||
      (this.currentBytes + approxBytes > this.maxTotalBytes && this.map.size > 0)
    ) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }

    this.map.set(key, {
      value,
      expiresAt: Date.now() + (customTtlMs ?? this.ttlMs),
      approxBytes,
    });
    this.currentBytes += approxBytes;
  }

  /**
   * Deduplicates concurrent async fetches for the same key and caches the result.
   */
  public async getOrFetch(
    key: string,
    fetcher: () => Promise<V>,
    options?: { forceRefresh?: boolean; ttlMs?: number }
  ): Promise<V> {
    if (!options?.forceRefresh) {
      const cached = this.get(key);
      if (cached !== undefined) {
        return cached;
      }
    }

    const existingPromise = this.inFlight.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = (async () => {
      try {
        const result = await fetcher();
        if (result !== undefined && result !== null) {
          this.set(key, result, options?.ttlMs);
        }
        return result;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  public delete(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.currentBytes = Math.max(0, this.currentBytes - entry.approxBytes);
    return this.map.delete(key);
  }

  /**
   * Removes all keys starting with the given prefix (e.g. `conn-123:` when a connection closes).
   */
  public deleteByPrefix(prefix: string): number {
    let removed = 0;
    for (const key of Array.from(this.map.keys())) {
      if (key.startsWith(prefix)) {
        this.delete(key);
        removed++;
      }
    }
    for (const key of Array.from(this.inFlight.keys())) {
      if (key.startsWith(prefix)) {
        this.inFlight.delete(key);
      }
    }
    return removed;
  }

  public clear(): void {
    this.map.clear();
    this.inFlight.clear();
    this.currentBytes = 0;
  }

  public get size(): number {
    return this.map.size;
  }

  public get bytesUsed(): number {
    return this.currentBytes;
  }

  public get totalBytes(): number {
    return this.currentBytes;
  }

  private estimateBytes(val: unknown): number {
    if (val === null || val === undefined) return 8;
    if (typeof val === 'string') return val.length * 2;
    if (typeof val === 'number' || typeof val === 'boolean') return 8;
    try {
      return JSON.stringify(val).length * 2;
    } catch {
      return 256;
    }
  }
}

// Shared metadata caches with strict entry & memory caps
export const metadataCache = {
  tables: new BoundedLruCache<any[]>({ maxEntries: 32, ttlMs: 120_000, maxTotalBytes: 4 * 1024 * 1024 }),
  schemas: new BoundedLruCache<any>({ maxEntries: 150, ttlMs: 180_000, maxTotalBytes: 8 * 1024 * 1024 }),
  functions: new BoundedLruCache<any[]>({ maxEntries: 32, ttlMs: 180_000, maxTotalBytes: 4 * 1024 * 1024 }),
  databases: new BoundedLruCache<string[]>({ maxEntries: 32, ttlMs: 300_000, maxTotalBytes: 1 * 1024 * 1024 }),

  evictConnection(connId: string): void {
    if (!connId) return;
    const prefix = `${connId}:`;
    this.tables.deleteByPrefix(prefix);
    this.schemas.deleteByPrefix(prefix);
    this.functions.deleteByPrefix(prefix);
    this.databases.deleteByPrefix(prefix);
  },

  clearAll(): void {
    this.tables.clear();
    this.schemas.clear();
    this.functions.clear();
    this.databases.clear();
  },
};
