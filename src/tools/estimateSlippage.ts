/**
 * estimate_slippage tool — Jupiter-based slippage estimation for Solana tokens.
 * Shows price impact for $50, $100, $500, $1000 buys.
 * Uses Jupiter Quote API (free, no auth).
 */
import { estimateSlippage, type SlippageEstimate } from '../sources/jupiter.js';
import { getPrice } from '../sources/dexscreener.js';
import { getTokenSecurity } from '../sources/solanaRpc.js';
import { debug } from '../utils/debug.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface SlippageResult {
  token: string;
  symbol: string;
  name: string;
  currentPriceUsd: number;
  solPriceUsd: number;
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
  debug(`Estimating slippage for ${address}`);

  // Get SOL price first
  const solPrice = await getPrice(SOL_MINT, 'solana');
  if (!solPrice) {
    return { error: 'Could not fetch SOL price. DexScreener may be temporarily unavailable.' };
  }

  // Get token info
  const tokenPrice = await getPrice(address, 'solana');
  if (!tokenPrice) {
    return { error: `Token not found on DexScreener: ${address}. Check the address or try searching by name with search_token.` };
  }

  // Fetch actual token decimals from Solana RPC (falls back to 6 if unavailable)
  const security = await getTokenSecurity(address).catch(() => null);
  const tokenDecimals = security?.decimals ?? 6;

  const estimates = await estimateSlippage(address, solPrice.priceUsd, tokenDecimals);

  if (estimates.length === 0) {
    return { error: `No Jupiter routes found for ${tokenPrice.symbol}. The token may not have enough liquidity on Jupiter-supported DEXes.` };
  }

  // Build summary
  const summaryParts: string[] = [];
  summaryParts.push(`Slippage estimates for ${tokenPrice.symbol} (${tokenPrice.name}):`);

  for (const est of estimates) {
    const impactStr = est.priceImpactPct > 1
      ? `${est.priceImpactPct.toFixed(2)}% (HIGH)`
      : est.priceImpactPct > 0.3
        ? `${est.priceImpactPct.toFixed(2)}% (moderate)`
        : `${est.priceImpactPct.toFixed(4)}% (low)`;
    summaryParts.push(`  $${est.buyAmountUsd}: ${est.estimatedOutput.toFixed(2)} ${tokenPrice.symbol}, price impact ${impactStr}, via ${est.route}`);
  }

  // Overall assessment
  const maxImpact = Math.max(...estimates.map(e => e.priceImpactPct));
  if (maxImpact > 5) {
    summaryParts.push(`\nWARNING: Very high price impact even at small sizes. Extremely illiquid token.`);
  } else if (maxImpact > 2) {
    summaryParts.push(`\nCaution: Significant price impact at larger sizes. Trade in smaller amounts.`);
  } else if (maxImpact > 0.5) {
    summaryParts.push(`\nModerate liquidity. $100-500 buys are reasonable, larger sizes will move the price.`);
  } else {
    summaryParts.push(`\nGood liquidity. All tested buy sizes have low price impact.`);
  }

  return {
    token: address,
    symbol: tokenPrice.symbol,
    name: tokenPrice.name,
    currentPriceUsd: tokenPrice.priceUsd,
    solPriceUsd: solPrice.priceUsd,
    estimates,
    summary: summaryParts.join('\n'),
    fetchedAt: new Date().toISOString(),
  };
}
