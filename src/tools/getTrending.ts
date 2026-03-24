/**
 * get_trending tool — Trending/boosted tokens from DexScreener.
 * Returns tokens sorted by boost activity with price enrichment.
 */
import { getTrending } from '../sources/dexscreener.js';

export async function handleGetTrending(args: { chain?: string; limit?: number }) {
  const chain = args.chain || 'solana';
  const limit = Math.min(Math.max(1, args.limit || 20), 50);
  const tokens = await getTrending(chain, limit);

  if (tokens.length === 0) {
    return {
      chain,
      count: 0,
      tokens: [],
      note: `No trending tokens found on ${chain}. DexScreener boost data may be temporarily unavailable.`,
      fetchedAt: new Date().toISOString(),
    };
  }

  return {
    chain,
    count: tokens.length,
    tokens,
    fetchedAt: new Date().toISOString(),
  };
}
