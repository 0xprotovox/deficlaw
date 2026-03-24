/**
 * TTL-based in-memory cache with automatic cleanup.
 * Expired entries are purged periodically to prevent unbounded memory growth.
 */
export class MemoryCache<T> {
  private cache = new Map<string, { data: T; ts: number }>();
  private readonly ttlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Maximum entries before forced cleanup (safety valve) */
  private static readonly MAX_ENTRIES = 10_000;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
    // Run cleanup every 5 minutes (or 10x TTL, whichever is larger)
    const cleanupInterval = Math.max(ttlMs * 10, 5 * 60 * 1000);
    this.cleanupTimer = setInterval(() => this.evictExpired(), cleanupInterval);
    // Allow the process to exit even if the timer is running
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    // Safety valve: if cache is way too large, evict oldest entries
    if (this.cache.size >= MemoryCache.MAX_ENTRIES) {
      this.evictExpired();
      // If still over limit after eviction, drop oldest half
      if (this.cache.size >= MemoryCache.MAX_ENTRIES) {
        const keys = [...this.cache.keys()];
        for (let i = 0; i < keys.length / 2; i++) {
          this.cache.delete(keys[i]);
        }
      }
    }
    this.cache.set(key, { data, ts: Date.now() });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /** Number of entries (including possibly expired ones) */
  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  /** Stop the background cleanup timer */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
  }

  /** Remove all expired entries */
  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.ts > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }
}
