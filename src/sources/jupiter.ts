/**
 * Jupiter Quote API Client
 * Free API, no auth needed. Used for slippage estimation on Solana.
 * https://station.jup.ag/docs/apis/swap-api
 */
import { MemoryCache } from '../cache/memoryCache.js';
import { debug } from '../utils/debug.js';

const BASE_URL = 'https://api.jup.ag/quote/v1';
const CACHE_TTL = 30_000; // 30s cache for quotes
const SOL_MINT = 'So11111111111111111111111111111111111112';
const SOL_DECIMALS = 9;

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  slippageBps: number;
  routePlan: { swapInfo: { ammKey: string; label: string } }[];
}

export interface SlippageEstimate {
  buyAmountUsd: number;
  inputLamports: string;
  estimatedOutput: number;
  priceImpactPct: number;
  effectivePrice: number;
  slippageBps: number;
  route: string;
}

const quoteCache = new MemoryCache<JupiterQuote>(CACHE_TTL);

/**
 * Get a Jupiter quote for buying a token with SOL.
 * amount is in lamports (1 SOL = 1e9 lamports).
 */
export async function getQuote(
  outputMint: string,
  amountLamports: string,
  slippageBps = 50
): Promise<JupiterQuote | null> {
  const cacheKey = `jup:${outputMint}:${amountLamports}:${slippageBps}`;
  const cached = quoteCache.get(cacheKey);
  if (cached) {
    debug(`jupiter quote cache HIT: ${cacheKey}`);
    return cached;
  }

  const url = `${BASE_URL}?inputMint=${SOL_MINT}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
  debug(`Fetching Jupiter quote: ${url}`);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      debug(`Jupiter HTTP ${res.status}: ${res.statusText}`);
      return null;
    }

    const data = await res.json() as JupiterQuote;
    if (!data.outAmount) return null;

    quoteCache.set(cacheKey, data);
    return data;
  } catch (err) {
    debug(`Jupiter quote failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Estimate slippage for multiple buy sizes.
 * Returns quotes for $50, $100, $500, $1000 buys.
 */
export async function estimateSlippage(
  tokenMint: string,
  solPriceUsd: number,
  tokenDecimals: number
): Promise<SlippageEstimate[]> {
  const buyAmounts = [50, 100, 500, 1000]; // USD amounts
  const results: SlippageEstimate[] = [];

  // Convert USD amounts to SOL lamports
  const quotes = await Promise.all(
    buyAmounts.map(async (usdAmount): Promise<SlippageEstimate | null> => {
      const solAmount = usdAmount / solPriceUsd;
      const lamports = Math.round(solAmount * 1e9).toString();

      const quote = await getQuote(tokenMint, lamports);
      if (!quote) return null;

      const outAmount = parseFloat(quote.outAmount) / Math.pow(10, tokenDecimals);
      const priceImpact = parseFloat(quote.priceImpactPct) || 0;
      const effectivePrice = outAmount > 0 ? usdAmount / outAmount : 0;

      // Determine route label
      const routeLabels = quote.routePlan
        ?.map(r => r.swapInfo?.label)
        .filter(Boolean) ?? [];
      const route = routeLabels.length > 0 ? routeLabels.join(' -> ') : 'unknown';

      return {
        buyAmountUsd: usdAmount,
        inputLamports: lamports,
        estimatedOutput: outAmount,
        priceImpactPct: Math.round(priceImpact * 10000) / 10000,
        effectivePrice,
        slippageBps: quote.slippageBps,
        route,
      };
    })
  );

  for (const q of quotes) {
    if (q) results.push(q);
  }

  return results;
}

export { SOL_MINT, SOL_DECIMALS };
