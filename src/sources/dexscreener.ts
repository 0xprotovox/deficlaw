/**
 * DexScreener API Client
 * Free API, no auth needed. Rate limit: ~300 req/min (we cap at ~150).
 * All fetches have timeouts, retries on transient errors, and proper error handling.
 */
import { MemoryCache } from '../cache/memoryCache.js';
import type { DexPair, PriceResult, TrendingToken, DexBoostEntry } from '../types/index.js';
import { debug } from '../utils/debug.js';

const BASE_URL = 'https://api.dexscreener.com';
const PAIR_CACHE_TTL = 5 * 60 * 1000;   // 5 min
const PRICE_CACHE_TTL = parseInt(process.env.DEFICLAW_PRICE_CACHE_TTL ?? '', 10) || 30 * 1000;
const TRENDING_CACHE_TTL = 30 * 1000;    // 30s
const MAX_RETRIES = 2;

// Simple rate limiter — sequential queue with min interval
let lastRequestMs = 0;
const MIN_INTERVAL = 200; // 200ms between requests

/**
 * Fetch with rate limiting, timeout, and retry for transient failures.
 * Returns parsed JSON on success; throws on permanent failures.
 */
async function throttledFetch<T>(url: string, timeoutMs = 8000): Promise<T> {
  const now = Date.now();
  const wait = MIN_INTERVAL - (now - lastRequestMs);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestMs = Date.now();

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });

      if (res.status === 429) {
        // Rate limited — wait and retry
        const retryAfter = Math.min(parseInt(res.headers.get('retry-after') || '2', 10) * 1000, 10000);
        await new Promise(r => setTimeout(r, retryAfter));
        continue;
      }

      if (res.status >= 500 && attempt < MAX_RETRIES) {
        // Server error — brief pause and retry
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }

      if (!res.ok) {
        throw new Error(`DexScreener HTTP ${res.status}: ${res.statusText} (${url})`);
      }

      return await res.json() as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof TypeError && attempt < MAX_RETRIES) {
        // Network error (DNS, connection refused, etc.) — retry
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (lastError.name === 'TimeoutError' && attempt < MAX_RETRIES) {
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error(`DexScreener request failed after ${MAX_RETRIES + 1} attempts`);
}

const pairCache = new MemoryCache<DexPair>(PAIR_CACHE_TTL);
const priceCache = new MemoryCache<PriceResult>(PRICE_CACHE_TTL);
const trendingCache = new MemoryCache<(TrendingToken & Partial<PriceResult>)[]>(TRENDING_CACHE_TTL);

/** Get best pair for a token address (highest liquidity on the target chain) */
export async function getTokenPair(address: string, chain = 'solana'): Promise<DexPair | null> {
  if (!address || address.trim().length === 0) return null;

  const cacheKey = `${chain}:${address}`;
  const cached = pairCache.get(cacheKey);
  if (cached) {
    debug(`pair cache HIT: ${cacheKey}`);
    return cached;
  }
  debug(`pair cache MISS: ${cacheKey}`);

  const data = await throttledFetch<{ pairs?: DexPair[] }>(`${BASE_URL}/latest/dex/tokens/${address}`);
  const pairs: DexPair[] = data.pairs ?? [];

  if (pairs.length === 0) return null;

  // Filter by chain and sort by liquidity
  const chainPairs = pairs
    .filter(p => p.chainId === chain)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));

  const best = chainPairs[0] ?? pairs[0] ?? null;
  if (best) pairCache.set(cacheKey, best);
  return best;
}

/** Quick price lookup — returns null if token not found */
export async function getPrice(address: string, chain = 'solana'): Promise<PriceResult | null> {
  if (!address || address.trim().length === 0) return null;

  const cacheKey = `price:${chain}:${address}`;
  const cached = priceCache.get(cacheKey);
  if (cached) {
    debug(`price cache HIT: ${cacheKey}`);
    return cached;
  }
  debug(`price cache MISS: ${cacheKey}`);

  const pair = await getTokenPair(address, chain);
  if (!pair) return null;

  const priceUsd = parseFloat(pair.priceUsd);

  const result: PriceResult = {
    address: pair.baseToken.address,
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name,
    priceUsd: isNaN(priceUsd) ? 0 : priceUsd,
    priceChange1h: pair.priceChange?.h1 ?? 0,
    priceChange24h: pair.priceChange?.h24 ?? 0,
    volume24h: pair.volume?.h24 ?? 0,
    liquidity: pair.liquidity?.usd ?? 0,
    marketCap: pair.marketCap ?? 0,
    dex: pair.dexId,
  };

  priceCache.set(cacheKey, result);
  return result;
}

/** Search tokens by name or symbol */
export async function searchTokens(query: string): Promise<DexPair[]> {
  if (!query || query.trim().length === 0) return [];

  const data = await throttledFetch<{ pairs?: DexPair[] }>(
    `${BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}`
  );
  return (data.pairs ?? []).slice(0, 20);
}

/** Get recently created token pairs on a chain, sorted by creation time desc */
export async function getNewPairs(chain = 'solana', maxAgeMinutes = 60, limit = 20): Promise<DexPair[]> {
  const clampedLimit = Math.min(Math.max(1, limit), 50);
  const cacheKey = `newpairs:${chain}:${maxAgeMinutes}`;
  const cached = trendingCache.get(cacheKey);
  if (cached) {
    debug(`newpairs cache HIT: ${cacheKey}`);
    return cached.slice(0, clampedLimit) as unknown as DexPair[];
  }

  debug(`Fetching new pairs for ${chain} (max age ${maxAgeMinutes}m)`);

  // Use DexScreener token profiles + latest boosts to find new tokens
  // Then filter by creation time
  const data = await throttledFetch<DexPair[]>(
    `${BASE_URL}/token-profiles/latest/v1`
  ).catch((): DexPair[] => []);

  const raw = Array.isArray(data) ? data : [];
  const now = Date.now();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  // These are profile entries, not pairs. We need to fetch pair data for each.
  // Filter by chain first
  type ProfileEntry = { chainId?: string; tokenAddress?: string; url?: string; description?: string };
  const chainTokens = (raw as unknown as ProfileEntry[])
    .filter(t => t.chainId === chain && t.tokenAddress)
    .slice(0, clampedLimit * 2); // fetch extra in case some don't have pairs

  // Fetch pair data in parallel for each token
  const pairsResults = await Promise.all(
    chainTokens.map(async (t): Promise<DexPair | null> => {
      try {
        const pair = await getTokenPair(t.tokenAddress!, chain);
        if (!pair) return null;
        // Filter by age
        if (pair.pairCreatedAt && (now - pair.pairCreatedAt) > maxAgeMs) return null;
        return pair;
      } catch {
        return null;
      }
    })
  );

  const validPairs = pairsResults
    .filter((p): p is DexPair => p !== null)
    .sort((a, b) => (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0))
    .slice(0, clampedLimit);

  debug(`Found ${validPairs.length} new pairs on ${chain}`);
  return validPairs;
}

/** Get trending/boosted tokens. Enriches with price data in parallel. */
export async function getTrending(chain = 'solana', limit = 20): Promise<(TrendingToken & Partial<PriceResult>)[]> {
  const clampedLimit = Math.min(Math.max(1, limit), 50);

  const cacheKey = `trending:${chain}`;
  const cached = trendingCache.get(cacheKey);
  if (cached) return cached.slice(0, clampedLimit);

  // Fetch both boost endpoints in parallel — catch individually so one failure doesn't block the other
  const [topData, latestData] = await Promise.all([
    throttledFetch<DexBoostEntry[]>(`${BASE_URL}/token-boosts/top/v1`).catch((): DexBoostEntry[] => []),
    throttledFetch<DexBoostEntry[]>(`${BASE_URL}/token-boosts/latest/v1`).catch((): DexBoostEntry[] => []),
  ]);

  const top = Array.isArray(topData) ? topData : [];
  const latest = Array.isArray(latestData) ? latestData : [];

  // Merge and deduplicate by address
  const seen = new Set<string>();
  const merged: TrendingToken[] = [];

  for (const token of [...top, ...latest]) {
    if (!token.tokenAddress || seen.has(token.tokenAddress)) continue;
    if (token.chainId !== chain) continue;
    seen.add(token.tokenAddress);
    merged.push({
      address: token.tokenAddress,
      symbol: token.description?.split('/')[0] || token.tokenAddress.slice(0, 6),
      name: token.description || '',
      chainId: token.chainId,
      url: token.url || '',
      boostAmount: token.totalAmount || 0,
    });
  }

  // Enrich top items with price data — all in parallel
  const enriched = await Promise.all(
    merged.slice(0, clampedLimit).map(async (t): Promise<TrendingToken & Partial<PriceResult>> => {
      try {
        const price = await getPrice(t.address, chain);
        return price ? { ...t, ...price } : t;
      } catch {
        return t;
      }
    })
  );

  trendingCache.set(cacheKey, enriched);
  return enriched.slice(0, clampedLimit);
}
