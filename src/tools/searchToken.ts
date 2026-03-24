/**
 * search_token tool — Search tokens by name or symbol via DexScreener.
 * Returns top matches with address, price, chain.
 */
import { searchTokens } from '../sources/dexscreener.js';
import { debug } from '../utils/debug.js';

interface SearchResult {
  address: string;
  name: string;
  symbol: string;
  chain: string;
  priceUsd: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
  dex: string;
  pairCreatedAt: string | null;
}

export async function handleSearchToken(args: { query: string; chain?: string; limit?: number }): Promise<
  { results: SearchResult[]; count: number; query: string } | { error: string }
> {
  if (!args.query || args.query.trim().length === 0) {
    return { error: 'Search query is required (token name or symbol)' };
  }

  const query = args.query.trim();
  const chain = args.chain || undefined;
  const limit = Math.min(Math.max(1, args.limit || 10), 20);

  debug(`Searching tokens: "${query}" chain=${chain ?? 'any'} limit=${limit}`);

  const pairs = await searchTokens(query);

  if (pairs.length === 0) {
    return { error: `No tokens found matching "${query}". Try a different name or symbol.` };
  }

  // Filter by chain if specified
  const filtered = chain ? pairs.filter(p => p.chainId === chain) : pairs;

  if (filtered.length === 0) {
    return { error: `No tokens found matching "${query}" on ${chain}. Found results on other chains.` };
  }

  const results: SearchResult[] = filtered.slice(0, limit).map(p => ({
    address: p.baseToken.address,
    name: p.baseToken.name,
    symbol: p.baseToken.symbol,
    chain: p.chainId,
    priceUsd: parseFloat(p.priceUsd) || 0,
    volume24h: p.volume?.h24 ?? 0,
    liquidity: p.liquidity?.usd ?? 0,
    marketCap: p.marketCap ?? 0,
    dex: p.dexId,
    pairCreatedAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
  }));

  debug(`Search "${query}": ${results.length} results`);

  return {
    query,
    count: results.length,
    results,
  };
}
