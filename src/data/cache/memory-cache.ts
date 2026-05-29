// ────────────────────────────────────────────────────────────────────────────
// LRU Memory Cache with TTL and request coalescing
//
// ■ LRU eviction when maxSize is exceeded.
// ■ TTL-based expiration on every get().
// ■ getOrFetch() prevents thundering-herd by sharing in-flight promises.
// ────────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // epoch ms (0 = never expires)
}

export interface MemoryCacheOptions {
  /** Maximum number of entries.  Default: 1000. */
  maxSize?: number;
  /** Time-to-live per entry in milliseconds.  Default: 5 minutes. */
  ttlMs?: number;
}

export class MemoryCache<T> {
  private readonly maxSize: number;
  private readonly ttlMs: number;

  /**
   * We use a plain Map whose iteration order is insertion order.
   * On access we delete-then-reinsert to maintain LRU ordering.
   */
  private store = new Map<string, CacheEntry<T>>();

  /**
   * In-flight promises keyed by cache key.
   * Used by getOrFetch() for request coalescing.
   */
  private inflight = new Map<string, Promise<T>>();

  constructor(options: MemoryCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 1_000;
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1_000;
  }

  // ── Core operations ────────────────────────────────────────────────────

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    // Expired?
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    // Move to end (most-recently used).
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    // If key already exists, remove it first so it moves to the end.
    this.store.delete(key);

    // Evict LRU entries if over capacity.
    while (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      } else {
        break;
      }
    }

    this.store.set(key, {
      value,
      expiresAt: this.ttlMs > 0 ? Date.now() + this.ttlMs : 0,
    });
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  size(): number {
    // Only count non-expired entries.
    this.evictExpired();
    return this.store.size;
  }

  // ── Request coalescing ─────────────────────────────────────────────────

  /**
   * Returns the cached value if present.  Otherwise calls `fetcher()` exactly
   * once — concurrent callers for the same key share the same Promise.
   */
  async getOrFetch(key: string, fetcher: () => Promise<T>): Promise<T> {
    // 1. Cache hit.
    const cached = this.get(key);
    if (cached !== undefined) return cached;

    // 2. Already in flight?  Piggy-back on the existing promise.
    const existing = this.inflight.get(key);
    if (existing) return existing;

    // 3. Launch the fetch and register it.
    const promise = (async () => {
      try {
        const value = await fetcher();
        this.set(key, value);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}
