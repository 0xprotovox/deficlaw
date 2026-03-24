/**
 * get_price tool — Quick price lookup
 */
import { getPrice } from '../sources/dexscreener.js';

export async function handleGetPrice(args: { token: string; chain?: string }) {
  const chain = args.chain || 'solana';
  const result = await getPrice(args.token, chain);

  if (!result) {
    return { error: `Token not found: ${args.token} on ${chain}` };
  }

  return result;
}
