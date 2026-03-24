/**
 * DexScreener API Client
 * Pattern from TradingBox dexScreenerService.js
 * Free API, no auth needed. Rate limit: ~300 req/min (we cap at 150)
 */
import { MemoryCache } from '../cache/memoryCache.js';
import type { DexPair } from '../types/index.js';

const BASE_URL = 'https://api.dexscreener.com';
const PAIR_CACHE_TTL = 5 * 60 * 1000;   // 5 min
const PRICE_CACHE_TTL = 30 * 1000;       // 30s
const TRENDING_CACHE_TTL = 30 * 1000;    // 30s

// Simple rate limiter — sequential queue with min interval
let lastRequestMs = 0;
const MIN_INTERVAL = 200; // 200ms between requests

async function throttledFetch(url: string, timeoutMs = 8000): Promise<any> {
  const now = Date.now();
  const wait = MIN_INTERVAL - (now - lastRequestMs);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestMs = Date.now();

  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`DexScreener ${res.status}: ${res.statusText}`);
  return res.json();
}

const pairCache = new MemoryCache<DexPair>(PAIR_CACHE_TTL);
const priceCache = new MemoryCache<DexPair>(PRICE_CACHE_TTL);
const trendingCache = new MemoryCache<any[]>(TRENDING_CACHE_TTL);

/** Get best pair for a token address (highest liquidity) */
export async function getTokenPair(address: string, chain = 'solana'): Promise<DexPair | null> {
  const cacheKey = `${chain}:${address}`;
  const cached = pairCache.get(cacheKey);
  if (cached) return cached;

  const data = await throttledFetch(`${BASE_URL}/latest/dex/tokens/${address}`);
  const pairs: DexPair[] = data.pairs || [];

  // Filter by chain and sort by liquidity
  const chainPairs = pairs
    .filter(p => p.chainId === chain)
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));

  const best = chainPairs[0] || pairs[0] || null;
  if (best) pairCache.set(cacheKey, best);
  return best;
}

/** Quick price lookup */
export async function getPrice(address: string, chain = 'solana'): Promise<{
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceChange1h: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  dex: string;
} | null> {
  const cacheKey = `price:${chain}:${address}`;
  const cached = priceCache.get(cacheKey) as any;
  if (cached) return cached;

  const pair = await getTokenPair(address, chain);
  if (!pair) return null;

  const result = {
    address: pair.baseToken.address,
    symbol: pair.baseToken.symbol,
    name: pair.baseToken.name,
    priceUsd: parseFloat(pair.priceUsd) || 0,
    priceChange1h: pair.priceChange?.h1 || 0,
    priceChange24h: pair.priceChange?.h24 || 0,
    volume24h: pair.volume?.h24 || 0,
    liquidity: pair.liquidity?.usd || 0,
    marketCap: pair.marketCap || 0,
    dex: pair.dexId,
  };

  priceCache.set(cacheKey, result as any);
  return result;
}

/** Search tokens by name or symbol */
export async function searchTokens(query: string): Promise<DexPair[]> {
  const data = await throttledFetch(`${BASE_URL}/latest/dex/search?q=${encodeURIComponent(query)}`);
  return (data.pairs || []).slice(0, 20);
}

/** Get trending/boosted tokens */
export async function getTrending(chain = 'solana', limit = 20): Promise<any[]> {
  const cacheKey = `trending:${chain}`;
  const cached = trendingCache.get(cacheKey);
  if (cached) return cached.slice(0, limit);

  const [topData, latestData] = await Promise.all([
    throttledFetch(`${BASE_URL}/token-boosts/top/v1`).catch(() => []),
    throttledFetch(`${BASE_URL}/token-boosts/latest/v1`).catch(() => []),
  ]);

  const top = Array.isArray(topData) ? topData : [];
  const latest = Array.isArray(latestData) ? latestData : [];

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const token of [...top, ...latest]) {
    if (!token.tokenAddress || seen.has(token.tokenAddress)) continue;
    if (token.chainId !== chain) continue;
    seen.add(token.tokenAddress);
    merged.push({
      address: token.tokenAddress,
      symbol: token.description?.split('/')[0] || token.tokenAddress.slice(0, 6),
      name: token.description || '',
      chainId: token.chainId,
      url: token.url,
      boostAmount: token.totalAmount || 0,
    });
  }

  // Enrich top items with price data
  const enriched = await Promise.all(
    merged.slice(0, limit).map(async (t) => {
      try {
        const price = await getPrice(t.address, chain);
        return { ...t, ...price };
      } catch {
        return t;
      }
    })
  );

  trendingCache.set(cacheKey, enriched);
  return enriched.slice(0, limit);
}
