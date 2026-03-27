/**
 * estimate_slippage tool — Liquidity-based slippage estimation
 * Uses DexScreener pool data to estimate price impact at $50/$100/$500/$1000
 */
import { estimateSlippageFromLiquidity, type SlippageEstimate } from '../sources/jupiter.js';
import { getPrice, getTokenPair } from '../sources/dexscreener.js';

interface SlippageResult {
  token: string;
  symbol: string;
  name: string;
  currentPriceUsd: number;
  liquidityUsd: number;
  dex: string;
  estimates: SlippageEstimate[];
  summary: string;
  fetchedAt: string;
}

export async function handleEstimateSlippage(args: {
  address: string;
}): Promise<SlippageResult | { error: string }> {
  if (!args.address || args.address.trim().length === 0) {
    return { error: 'Token address is required. Provide a Solana token mint address.' };
  }

  const address = args.address.trim();
  const pair = await getTokenPair(address, 'solana');
  if (!pair) {
    return { error: `Token not found on DexScreener: ${address}. Check the address or try searching by name.` };
  }

  const priceUsd = parseFloat(pair.priceUsd) || 0;
  const liquidityUsd = pair.liquidity?.usd || 0;
  const symbol = pair.baseToken.symbol;
  const name = pair.baseToken.name;
  const dex = pair.dexId;

  if (liquidityUsd <= 0) {
    return { error: `No liquidity data for ${symbol}. Cannot estimate slippage.` };
  }

  const estimates = estimateSlippageFromLiquidity(priceUsd, liquidityUsd, dex);

  if (estimates.length === 0) {
    return { error: `Could not estimate slippage for ${symbol}.` };
  }

  // Build summary
  const lines: string[] = [];
  lines.push(`Slippage estimates for ${symbol} (${name}):`);
  lines.push(`Pool liquidity: $${liquidityUsd.toLocaleString()} on ${dex}`);
  lines.push('');

  for (const est of estimates) {
    const impactStr = est.priceImpactPct > 5
      ? `${est.priceImpactPct.toFixed(2)}% (VERY HIGH)`
      : est.priceImpactPct > 1
        ? `${est.priceImpactPct.toFixed(2)}% (HIGH)`
        : est.priceImpactPct > 0.3
          ? `${est.priceImpactPct.toFixed(3)}% (moderate)`
          : `${est.priceImpactPct.toFixed(4)}% (low)`;
    lines.push(`  $${est.buyAmountUsd}: ~${est.estimatedOutput.toLocaleString()} ${symbol}, price impact ${impactStr}`);
  }

  // Overall assessment
  const maxImpact = Math.max(...estimates.map(e => e.priceImpactPct));
  lines.push('');
  if (maxImpact > 5) {
    lines.push('WARNING: Very high price impact. Extremely illiquid token. Trade tiny amounts only.');
  } else if (maxImpact > 2) {
    lines.push('Caution: Significant price impact at larger sizes. Trade in smaller amounts.');
  } else if (maxImpact > 0.5) {
    lines.push('Moderate liquidity. $100-500 buys are reasonable, larger sizes will move the price.');
  } else {
    lines.push('Good liquidity. All tested buy sizes have low price impact.');
  }

  lines.push('');
  lines.push('(Estimated from pool liquidity using constant-product AMM formula. Actual slippage may vary by DEX and route.)');

  return {
    token: address,
    symbol,
    name,
    currentPriceUsd: priceUsd,
    liquidityUsd,
    dex,
    estimates,
    summary: lines.join('\n'),
    fetchedAt: new Date().toISOString(),
  };
}
