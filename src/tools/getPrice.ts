/**
 * get_price tool — Quick price lookup via DexScreener.
 * Returns structured price data or error if token not found.
 */
import { getPrice, searchTokens } from '../sources/dexscreener.js';
import type { PriceResult } from '../types/index.js';

export async function handleGetPrice(args: { token: string; chain?: string }): Promise<PriceResult | { error: string }> {
  if (!args.token || args.token.trim().length === 0) {
    return { error: 'Token address or search query is required' };
  }

  const chain = args.chain || 'solana';
  const token = args.token.trim();

  // If it looks like an address (long alphanumeric), do direct lookup
  if (token.length > 20) {
    const result = await getPrice(token, chain);
    if (!result) {
      return { error: `Token not found: ${token} on ${chain}. Verify the address is correct.` };
    }
    return result;
  }

  // Otherwise try as a search query (symbol or name)
  const pairs = await searchTokens(token);
  const chainPair = pairs.find(p => p.chainId === chain) ?? pairs[0];
  if (!chainPair) {
    return { error: `No token found matching "${token}" on ${chain}` };
  }

  const result = await getPrice(chainPair.baseToken.address, chainPair.chainId);
  if (!result) {
    return { error: `Token data unavailable for "${token}" on ${chain}` };
  }

  return result;
}
