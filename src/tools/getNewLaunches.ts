/**
 * get_new_launches tool — Recently created tokens on a chain.
 * Uses DexScreener to find new token pairs sorted by creation time.
 */
import { getNewPairs } from '../sources/dexscreener.js';
import { debug } from '../utils/debug.js';

interface NewLaunchResult {
  address: string;
  name: string;
  symbol: string;
  chain: string;
  ageMinutes: number;
  ageDisplay: string;
  priceUsd: number;
  marketCap: number;
  liquidity: number;
  volume24h: number;
  volume1h: number;
  priceChange1h: number;
  dex: string;
  pairAddress: string;
}

export async function handleGetNewLaunches(args: { chain?: string; max_age_minutes?: number; limit?: number }): Promise<
  { chain: string; count: number; maxAgeMinutes: number; tokens: NewLaunchResult[]; fetchedAt: string } | { error: string }
> {
  const chain = args.chain || 'solana';
  const maxAge = Math.min(Math.max(5, args.max_age_minutes || 60), 1440); // 5 min to 24h
  const limit = Math.min(Math.max(1, args.limit || 20), 50);

  debug(`Fetching new launches on ${chain}, max age ${maxAge}m, limit ${limit}`);

  try {
    const pairs = await getNewPairs(chain, maxAge, limit);

    if (pairs.length === 0) {
      return {
        chain,
        count: 0,
        maxAgeMinutes: maxAge,
        tokens: [],
        fetchedAt: new Date().toISOString(),
      };
    }

    const now = Date.now();
    const tokens: NewLaunchResult[] = pairs.map(p => {
      const ageMs = p.pairCreatedAt ? now - p.pairCreatedAt : 0;
      const ageMinutes = Math.round(ageMs / 60000);
      const ageDisplay = ageMinutes < 60
        ? `${ageMinutes}m`
        : ageMinutes < 1440
          ? `${Math.round(ageMinutes / 60)}h ${ageMinutes % 60}m`
          : `${Math.round(ageMinutes / 1440)}d`;

      return {
        address: p.baseToken.address,
        name: p.baseToken.name,
        symbol: p.baseToken.symbol,
        chain: p.chainId,
        ageMinutes,
        ageDisplay,
        priceUsd: parseFloat(p.priceUsd) || 0,
        marketCap: p.marketCap ?? 0,
        liquidity: p.liquidity?.usd ?? 0,
        volume24h: p.volume?.h24 ?? 0,
        volume1h: p.volume?.h1 ?? 0,
        priceChange1h: p.priceChange?.h1 ?? 0,
        dex: p.dexId,
        pairAddress: p.pairAddress,
      };
    });

    debug(`Found ${tokens.length} new launches on ${chain}`);

    return {
      chain,
      count: tokens.length,
      maxAgeMinutes: maxAge,
      tokens,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `Failed to fetch new launches: ${message}` };
  }
}
