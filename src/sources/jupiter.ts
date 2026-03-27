/**
 * Slippage Estimation — based on DexScreener liquidity data
 * Jupiter API now requires auth, so we calculate price impact from pool liquidity
 * Formula: priceImpact ≈ tradeSize / (2 * poolLiquidity) for constant-product AMMs
 */
import { debug } from '../utils/debug.js';

export interface SlippageEstimate {
  buyAmountUsd: number;
  estimatedOutput: number;
  priceImpactPct: number;
  effectivePrice: number;
  slippageBps: number;
  route: string;
}

/**
 * Estimate slippage from pool liquidity using constant-product AMM formula.
 * priceImpact ≈ tradeSize / (2 * liquidityUsd) * 100
 * This is an approximation — real slippage depends on pool type and route.
 */
export function estimateSlippageFromLiquidity(
  tokenPriceUsd: number,
  liquidityUsd: number,
  dex: string,
  buyAmounts: number[] = [50, 100, 500, 1000]
): SlippageEstimate[] {
  if (liquidityUsd <= 0 || tokenPriceUsd <= 0) return [];

  return buyAmounts.map(usdAmount => {
    // Constant-product AMM price impact formula
    // For a buy of size X into a pool of size L:
    // priceImpact ≈ X / (2 * L) for small trades
    // For larger trades relative to pool: priceImpact = X / (L + X)
    const impact = usdAmount / (liquidityUsd + usdAmount);
    const impactPct = impact * 100;

    // Effective price after slippage
    const effectivePrice = tokenPriceUsd * (1 + impact);

    // Estimated tokens received
    const estimatedOutput = usdAmount / effectivePrice;

    // Convert impact to basis points
    const slippageBps = Math.round(impactPct * 100);

    debug(`Slippage $${usdAmount}: impact ${impactPct.toFixed(4)}% (${slippageBps}bps) on ${dex}`);

    return {
      buyAmountUsd: usdAmount,
      estimatedOutput: Math.round(estimatedOutput * 1000000) / 1000000,
      priceImpactPct: Math.round(impactPct * 10000) / 10000,
      effectivePrice,
      slippageBps,
      route: dex,
    };
  });
}
