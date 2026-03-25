/**
 * compare_tokens tool — Side-by-side token comparison.
 * Fetches both tokens from DexScreener, compares price, mcap, volume, liquidity, age.
 * If both are Solana, includes holder comparison from GMGN.
 */
import { getTokenPair } from '../sources/dexscreener.js';
import * as gmgn from '../sources/gmgn.js';
import { debug } from '../utils/debug.js';

interface TokenSnapshot {
  address: string;
  name: string;
  symbol: string;
  chain: string;
  priceUsd: number;
  marketCap: number;
  volume24h: number;
  volume1h: number;
  liquidity: number;
  priceChange1h: number;
  priceChange24h: number;
  age: string;
  ageMs: number;
  dex: string;
  holderCount?: number;
  top10Concentration?: number;
}

interface ComparisonResult {
  tokenA: TokenSnapshot;
  tokenB: TokenSnapshot;
  comparison: {
    higherMcap: string;
    higherVolume: string;
    higherLiquidity: string;
    betterPrice24h: string;
    older: string;
    mcapRatio: string;
    volumeRatio: string;
    liquidityRatio: string;
  };
  holderComparison?: {
    tokenAHolders: number;
    tokenBHolders: number;
    tokenATop10Pct: number;
    tokenBTop10Pct: number;
    moreDistributed: string;
  };
  summary: string;
  fetchedAt: string;
}

function computeAge(pairCreatedAt?: number): { ageStr: string; ageMs: number } {
  if (!pairCreatedAt) return { ageStr: 'unknown', ageMs: 0 };
  const ageMs = Date.now() - pairCreatedAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const ageStr = ageDays < 1 / 24 ? `${Math.round(ageDays * 24 * 60)}m`
    : ageDays < 1 ? `${Math.round(ageDays * 24)}h`
    : ageDays < 30 ? `${Math.round(ageDays)}d`
    : ageDays < 365 ? `${Math.round(ageDays / 30)}mo`
    : `${(ageDays / 365).toFixed(1)}y`;
  return { ageStr, ageMs };
}

function fmt(n: number): string {
  if (n === 0) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function ratio(a: number, b: number): string {
  if (b === 0) return a > 0 ? 'inf' : '0';
  return `${(a / b).toFixed(1)}x`;
}

export async function handleCompareTokens(args: {
  address_a: string;
  address_b: string;
  chain: string;
}): Promise<ComparisonResult | { error: string }> {
  const chain = args.chain || 'solana';

  if (!args.address_a || !args.address_b) {
    return { error: 'Both token addresses are required for comparison.' };
  }

  debug(`Comparing tokens: ${args.address_a} vs ${args.address_b} on ${chain}`);

  // Fetch both pairs in parallel
  const [pairA, pairB] = await Promise.all([
    getTokenPair(args.address_a, chain),
    getTokenPair(args.address_b, chain),
  ]);

  if (!pairA) {
    return { error: `Token A not found on DexScreener: ${args.address_a}. Check the address or try searching by name with search_token.` };
  }
  if (!pairB) {
    return { error: `Token B not found on DexScreener: ${args.address_b}. Check the address or try searching by name with search_token.` };
  }

  const ageA = computeAge(pairA.pairCreatedAt);
  const ageB = computeAge(pairB.pairCreatedAt);

  const tokenA: TokenSnapshot = {
    address: pairA.baseToken.address,
    name: pairA.baseToken.name,
    symbol: pairA.baseToken.symbol,
    chain: pairA.chainId,
    priceUsd: parseFloat(pairA.priceUsd) || 0,
    marketCap: pairA.marketCap ?? 0,
    volume24h: pairA.volume?.h24 ?? 0,
    volume1h: pairA.volume?.h1 ?? 0,
    liquidity: pairA.liquidity?.usd ?? 0,
    priceChange1h: pairA.priceChange?.h1 ?? 0,
    priceChange24h: pairA.priceChange?.h24 ?? 0,
    age: ageA.ageStr,
    ageMs: ageA.ageMs,
    dex: pairA.dexId,
  };

  const tokenB: TokenSnapshot = {
    address: pairB.baseToken.address,
    name: pairB.baseToken.name,
    symbol: pairB.baseToken.symbol,
    chain: pairB.chainId,
    priceUsd: parseFloat(pairB.priceUsd) || 0,
    marketCap: pairB.marketCap ?? 0,
    volume24h: pairB.volume?.h24 ?? 0,
    volume1h: pairB.volume?.h1 ?? 0,
    liquidity: pairB.liquidity?.usd ?? 0,
    priceChange1h: pairB.priceChange?.h1 ?? 0,
    priceChange24h: pairB.priceChange?.h24 ?? 0,
    age: ageB.ageStr,
    ageMs: ageB.ageMs,
    dex: pairB.dexId,
  };

  const comparison = {
    higherMcap: tokenA.marketCap >= tokenB.marketCap ? tokenA.symbol : tokenB.symbol,
    higherVolume: tokenA.volume24h >= tokenB.volume24h ? tokenA.symbol : tokenB.symbol,
    higherLiquidity: tokenA.liquidity >= tokenB.liquidity ? tokenA.symbol : tokenB.symbol,
    betterPrice24h: tokenA.priceChange24h >= tokenB.priceChange24h ? tokenA.symbol : tokenB.symbol,
    older: tokenA.ageMs >= tokenB.ageMs ? tokenA.symbol : tokenB.symbol,
    mcapRatio: ratio(
      Math.max(tokenA.marketCap, tokenB.marketCap),
      Math.min(tokenA.marketCap, tokenB.marketCap)
    ),
    volumeRatio: ratio(
      Math.max(tokenA.volume24h, tokenB.volume24h),
      Math.min(tokenA.volume24h, tokenB.volume24h)
    ),
    liquidityRatio: ratio(
      Math.max(tokenA.liquidity, tokenB.liquidity),
      Math.min(tokenA.liquidity, tokenB.liquidity)
    ),
  };

  // Holder comparison for Solana tokens
  let holderComparison: ComparisonResult['holderComparison'];
  if (chain === 'solana') {
    try {
      const [holdersA, holdersB] = await Promise.all([
        gmgn.getHolders(args.address_a).catch(() => null),
        gmgn.getHolders(args.address_b).catch(() => null),
      ]);

      if (holdersA && holdersB) {
        const sortedA = [...holdersA.holders].sort((a, b) => b.supplyPercent - a.supplyPercent);
        const sortedB = [...holdersB.holders].sort((a, b) => b.supplyPercent - a.supplyPercent);
        const top10A = sortedA.slice(0, 10).reduce((s, h) => s + h.supplyPercent, 0);
        const top10B = sortedB.slice(0, 10).reduce((s, h) => s + h.supplyPercent, 0);

        tokenA.holderCount = holdersA.holders.length;
        tokenA.top10Concentration = top10A;
        tokenB.holderCount = holdersB.holders.length;
        tokenB.top10Concentration = top10B;

        holderComparison = {
          tokenAHolders: holdersA.holders.length,
          tokenBHolders: holdersB.holders.length,
          tokenATop10Pct: Math.round(top10A * 10000) / 100,
          tokenBTop10Pct: Math.round(top10B * 10000) / 100,
          moreDistributed: top10A <= top10B ? tokenA.symbol : tokenB.symbol,
        };
      }
    } catch {
      // Holder comparison is non-critical
      debug('Holder comparison failed, skipping');
    }
  }

  // Build summary
  const lines: string[] = [];
  lines.push(`${tokenA.symbol} vs ${tokenB.symbol}:`);
  lines.push('');
  lines.push(`  ${''.padEnd(16)} ${tokenA.symbol.padEnd(18)} ${tokenB.symbol.padEnd(18)}`);
  lines.push(`  ${'Price'.padEnd(16)} ${fmt(tokenA.priceUsd).padEnd(18)} ${fmt(tokenB.priceUsd).padEnd(18)}`);
  lines.push(`  ${'Market Cap'.padEnd(16)} ${fmt(tokenA.marketCap).padEnd(18)} ${fmt(tokenB.marketCap).padEnd(18)}`);
  lines.push(`  ${'Volume 24h'.padEnd(16)} ${fmt(tokenA.volume24h).padEnd(18)} ${fmt(tokenB.volume24h).padEnd(18)}`);
  lines.push(`  ${'Liquidity'.padEnd(16)} ${fmt(tokenA.liquidity).padEnd(18)} ${fmt(tokenB.liquidity).padEnd(18)}`);
  lines.push(`  ${'Change 24h'.padEnd(16)} ${(tokenA.priceChange24h.toFixed(1) + '%').padEnd(18)} ${(tokenB.priceChange24h.toFixed(1) + '%').padEnd(18)}`);
  lines.push(`  ${'Age'.padEnd(16)} ${tokenA.age.padEnd(18)} ${tokenB.age.padEnd(18)}`);
  lines.push(`  ${'DEX'.padEnd(16)} ${tokenA.dex.padEnd(18)} ${tokenB.dex.padEnd(18)}`);

  if (holderComparison) {
    lines.push(`  ${'Holders'.padEnd(16)} ${String(holderComparison.tokenAHolders).padEnd(18)} ${String(holderComparison.tokenBHolders).padEnd(18)}`);
    lines.push(`  ${'Top10 Conc.'.padEnd(16)} ${(holderComparison.tokenATop10Pct + '%').padEnd(18)} ${(holderComparison.tokenBTop10Pct + '%').padEnd(18)}`);
  }

  lines.push('');
  lines.push(`Market cap ratio: ${comparison.mcapRatio} (${comparison.higherMcap} is larger).`);
  lines.push(`${comparison.higherVolume} has more volume, ${comparison.higherLiquidity} has deeper liquidity.`);
  lines.push(`${comparison.betterPrice24h} performed better in the last 24h.`);
  lines.push(`${comparison.older} is the older token.`);

  if (holderComparison) {
    lines.push(`${holderComparison.moreDistributed} has more distributed ownership.`);
  }

  return {
    tokenA,
    tokenB,
    comparison,
    holderComparison,
    summary: lines.join('\n'),
    fetchedAt: new Date().toISOString(),
  };
}
