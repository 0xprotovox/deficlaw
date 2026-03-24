/**
 * get_trending tool — Trending/boosted tokens
 */
import { getTrending } from '../sources/dexscreener.js';

export async function handleGetTrending(args: { chain?: string; limit?: number }) {
  const chain = args.chain || 'solana';
  const limit = args.limit || 20;
  const tokens = await getTrending(chain, limit);

  return {
    chain,
    count: tokens.length,
    tokens,
    fetchedAt: new Date().toISOString(),
  };
}
