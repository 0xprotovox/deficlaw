/**
 * analyze_token tool — Deep token analysis
 * DexScreener (price/volume/liquidity) + GMGN (holders/insiders/risk) + Solana RPC (security).
 * All FREE, no paid APIs.
 */
import { getTokenPair } from '../sources/dexscreener.js';
import * as gmgn from '../sources/gmgn.js';
import { getTokenSecurity, isLikelyLpPool, type TokenSecurity } from '../sources/solanaRpc.js';
import { scoreRisk } from '../analysis/riskScorer.js';
import { generateSummary } from '../analysis/summaryGenerator.js';
import type { Holder } from '../types/index.js';

interface HolderClassification {
  total: number;
  concentration: { top5Pct: number; top10Pct: number; top20Pct: number };
  categories: {
    devWallets: number; freshWallets: number; snipers: number; kols: number;
    smartMoney: number; diamondHands: number; insiders: number;
    photonUsers: number; gmgnUsers: number; transferIn: number;
  };
  sentiment: {
    profitableHolders: number; losingHolders: number; profitRatio: number;
    totalPnlUsd: number; totalCostUsd: number; avgPnlPerHolder: number;
  };
  pressure: {
    totalBuyVolume: number; totalSellVolume: number; buySellRatio: number;
    totalBuyTx: number; totalSellTx: number;
  };
  avgLastActive: string | null;
  devWallet: {
    address: string; holdingPercent: number; pnl: number;
    sellAmount: number; buyAmount: number; status: string;
  } | null;
  topHolders: {
    address: string; tags: string[]; supplyPercent: number; valueUsd: number;
    pnl: number; profitMultiple: number; buyTx: number; sellTx: number;
    isDeployer: boolean; isFreshWallet: boolean; twitterHandle: string | null;
  }[];
}

/** Classify holders into categories with full metrics */
function classifyHolders(holders: Holder[]): HolderClassification {
  const sorted = [...holders].sort((a, b) => b.supplyPercent - a.supplyPercent);

  const matchTag = (h: Holder, pattern: RegExp) => h.tags.some(t => pattern.test(t));

  const devWallets = holders.filter(h => h.isDeployer);
  const freshWallets = holders.filter(h => h.isFreshWallet);
  const snipers = holders.filter(h => matchTag(h, /sniper|bot|sandwich/i));
  const kols = holders.filter(h => matchTag(h, /kol|renowned|influencer/i));
  const smartMoney = holders.filter(h => matchTag(h, /smart|fund|whale/i));
  const diamondHands = holders.filter(h => matchTag(h, /diamond/i));
  const insiders = holders.filter(h => matchTag(h, /insider|team|early/i));
  const photonUsers = holders.filter(h => matchTag(h, /photon/i));
  const gmgnUsers = holders.filter(h => matchTag(h, /gmgn/i));
  const transferIn = holders.filter(h => matchTag(h, /transfer_in/i));

  // Profitable vs losing holders
  const profitable = holders.filter(h => h.totalPnl > 0);
  const losing = holders.filter(h => h.totalPnl < 0);
  const totalPnl = holders.reduce((s, h) => s + h.totalPnl, 0);
  const totalCost = holders.reduce((s, h) => s + h.cost, 0);

  // Buy vs Sell pressure
  const totalBuyVolume = holders.reduce((s, h) => s + (h.buyAmount || 0), 0);
  const totalSellVolume = holders.reduce((s, h) => s + (h.sellAmount || 0), 0);
  const totalBuyTx = holders.reduce((s, h) => s + h.buyTxCount, 0);
  const totalSellTx = holders.reduce((s, h) => s + h.sellTxCount, 0);

  // Concentration
  const top5Pct = sorted.slice(0, 5).reduce((s, h) => s + h.supplyPercent, 0);
  const top10Pct = sorted.slice(0, 10).reduce((s, h) => s + h.supplyPercent, 0);
  const top20Pct = sorted.slice(0, 20).reduce((s, h) => s + h.supplyPercent, 0);

  // Average last active time
  const activeDates = holders
    .filter(h => h.lastActiveAt)
    .map(h => new Date(h.lastActiveAt!).getTime());
  const avgLastActive = activeDates.length > 0
    ? new Date(activeDates.reduce((s, d) => s + d, 0) / activeDates.length).toISOString()
    : null;

  const devWallet = devWallets[0] ? {
    address: devWallets[0].address,
    holdingPercent: devWallets[0].supplyPercent,
    pnl: devWallets[0].totalPnl,
    sellAmount: devWallets[0].sellAmount,
    buyAmount: devWallets[0].buyAmount,
    status: devWallets[0].sellAmount > devWallets[0].buyAmount * 0.8 ? 'sold_most'
      : devWallets[0].sellAmount > 0 ? 'selling' : 'holding',
  } : null;

  return {
    total: holders.length,
    concentration: { top5Pct, top10Pct, top20Pct },
    categories: {
      devWallets: devWallets.length,
      freshWallets: freshWallets.length,
      snipers: snipers.length,
      kols: kols.length,
      smartMoney: smartMoney.length,
      diamondHands: diamondHands.length,
      insiders: insiders.length,
      photonUsers: photonUsers.length,
      gmgnUsers: gmgnUsers.length,
      transferIn: transferIn.length,
    },
    sentiment: {
      profitableHolders: profitable.length,
      losingHolders: losing.length,
      profitRatio: holders.length > 0 ? profitable.length / holders.length : 0,
      totalPnlUsd: totalPnl,
      totalCostUsd: totalCost,
      avgPnlPerHolder: holders.length > 0 ? totalPnl / holders.length : 0,
    },
    pressure: {
      totalBuyVolume,
      totalSellVolume,
      buySellRatio: totalSellVolume > 0 ? totalBuyVolume / totalSellVolume : (totalBuyVolume > 0 ? Infinity : 0),
      totalBuyTx,
      totalSellTx,
    },
    avgLastActive,
    devWallet,
    topHolders: sorted.slice(0, 20).map(h => ({
      address: h.address,
      tags: h.tags,
      supplyPercent: h.supplyPercent,
      valueUsd: h.valueUsd,
      pnl: h.totalPnl,
      profitMultiple: h.profitMultiple,
      buyTx: h.buyTxCount,
      sellTx: h.sellTxCount,
      isDeployer: h.isDeployer,
      isFreshWallet: h.isFreshWallet,
      twitterHandle: h.twitterHandle,
    })),
  };
}

export async function handleAnalyzeToken(args: {
  address: string;
  chain?: string;
  include_holders?: boolean;
}): Promise<Record<string, unknown> | { error: string }> {
  const chain = args.chain || 'solana';
  const includeHolders = args.include_holders !== false;
  const startMs = Date.now();
  const sources: string[] = [];

  // ── 1. DexScreener (required) ──
  const pair = await getTokenPair(args.address, chain);
  if (!pair) {
    return { error: `Token not found on DexScreener: ${args.address} (${chain}). Check the address and chain.` };
  }
  sources.push('dexscreener');

  // Token age calculation
  const ageMs = pair.pairCreatedAt ? Date.now() - pair.pairCreatedAt : 0;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const ageStr = ageDays < 1 / 24 ? `${Math.round(ageDays * 24 * 60)}m`
    : ageDays < 1 ? `${Math.round(ageDays * 24)}h`
    : ageDays < 30 ? `${Math.round(ageDays)}d`
    : ageDays < 365 ? `${Math.round(ageDays / 30)}mo`
    : `${(ageDays / 365).toFixed(1)}y`;

  // Volume/liquidity ratio
  const liquidityUsd = pair.liquidity?.usd ?? 0;
  const volumeLiquidityRatio = liquidityUsd > 0
    ? Math.round(((pair.volume?.h24 ?? 0) / liquidityUsd) * 100) / 100
    : 0;

  // ── 2. Parallel: GMGN holders + Solana security ──
  // Run holder fetch and security check in parallel for speed
  let holderAnalysis: HolderClassification | undefined;
  let kolHolders: Holder[] = [];
  let holderError: string | null = null;
  let allHolders: Holder[] = [];

  const isSolana = chain === 'solana';

  // Run holder fetch and security check in parallel for speed
  const holderPromise = (includeHolders && isSolana)
    ? gmgn.getHolders(args.address).catch((err: unknown): null => {
        holderError = `GMGN fetch failed: ${err instanceof Error ? err.message : String(err)}`;
        return null;
      })
    : Promise.resolve(null);

  const securityPromise = isSolana
    ? getTokenSecurity(args.address).catch((): null => null)
    : Promise.resolve(null);

  const [holderData, security] = await Promise.all([holderPromise, securityPromise]);

  if (holderData) {
    allHolders = holderData.holders;
    kolHolders = holderData.kolHolders;
    holderAnalysis = classifyHolders(allHolders);
    sources.push('gmgn');
  }
  if (security) sources.push('solana-rpc');

  // ── 3. Risk scoring (now includes security data) ──
  const risk = scoreRisk({
    pair,
    holders: allHolders.length > 0 ? allHolders : undefined,
    security,
  });

  // ── 4. LP detection (only if we have holders) ──
  let lpDetection: Record<string, unknown> | null = null;
  if (holderAnalysis?.topHolders[0] && isSolana) {
    try {
      const topIsLp = await isLikelyLpPool(holderAnalysis.topHolders[0].address);
      if (topIsLp) {
        lpDetection = {
          topHolderIsLp: true,
          lpAddress: holderAnalysis.topHolders[0].address,
          lpPercent: holderAnalysis.topHolders[0].supplyPercent,
          realTopHolder: holderAnalysis.topHolders[1]
            ? { address: holderAnalysis.topHolders[1].address, percent: holderAnalysis.topHolders[1].supplyPercent }
            : null,
        };
      }
    } catch { /* LP detection is non-critical */ }
  }

  // ── 5. Build result ──
  const result: Record<string, unknown> = {
    token: {
      address: pair.baseToken.address,
      name: pair.baseToken.name,
      symbol: pair.baseToken.symbol,
      chain,
      imageUrl: pair.info?.imageUrl,
      age: ageStr,
      createdAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
    },
    price: {
      usd: parseFloat(pair.priceUsd) || 0,
      nativePrice: pair.priceNative,
      change5m: pair.priceChange?.m5 ?? 0,
      change1h: pair.priceChange?.h1 ?? 0,
      change6h: pair.priceChange?.h6 ?? 0,
      change24h: pair.priceChange?.h24 ?? 0,
    },
    market: {
      marketCap: pair.marketCap ?? 0,
      fdv: pair.fdv ?? 0,
      volume24h: pair.volume?.h24 ?? 0,
      volume6h: pair.volume?.h6 ?? 0,
      volume1h: pair.volume?.h1 ?? 0,
      volume5m: pair.volume?.m5 ?? 0,
      liquidity: liquidityUsd,
      volumeLiquidityRatio,
      dex: pair.dexId,
      pairAddress: pair.pairAddress,
    },
    risk,
  };

  if (holderAnalysis) {
    result.holders = holderAnalysis;
    if (kolHolders.length > 0) {
      result.kols = kolHolders.slice(0, 10).map(k => ({
        address: k.address,
        tags: k.tags,
        twitterHandle: k.twitterHandle,
        twitterName: k.twitterName,
        supplyPercent: k.supplyPercent,
        pnl: k.totalPnl,
        status: k.sellAmount > k.buyAmount * 0.5 ? 'selling' : 'holding',
      }));
    }
  }

  if (holderError) result.holderNote = holderError;

  if (security) {
    result.security = {
      mintAuthority: security.mintAuthority,
      freezeAuthority: security.freezeAuthority,
      supply: security.supply,
      decimals: security.decimals,
    };
  }

  if (lpDetection) result.lpDetection = lpDetection;

  // Socials from DexScreener
  if (pair.info?.websites || pair.info?.socials) {
    result.socials = {
      websites: pair.info.websites?.map(w => w.url) ?? [],
      twitter: pair.info.socials?.find(s => s.type === 'twitter')?.url ?? null,
      telegram: pair.info.socials?.find(s => s.type === 'telegram')?.url ?? null,
    };
  }

  // ── 6. Generate human-readable summary ──
  const securityForSummary = security ? {
    mintAuthority: security.mintAuthority,
    freezeAuthority: security.freezeAuthority,
    isLpTopHolder: !!lpDetection,
    realTopHolderPct: (lpDetection as Record<string, unknown>)?.realTopHolder
      ? ((lpDetection as Record<string, unknown>).realTopHolder as { percent: number }).percent
      : 0,
  } : undefined;

  result.summary = generateSummary({
    token: result.token as { symbol: string; name: string; age: string },
    price: result.price as { usd: number; change1h: number; change6h: number; change24h: number; change5m: number },
    market: result.market as { marketCap: number; volume24h: number; volume1h: number; volume5m: number; liquidity: number; volumeLiquidityRatio: number; dex: string },
    risk: result.risk as { score: number; level: string },
    holders: holderAnalysis,
    kols: result.kols as { twitterHandle: string | null; status: string; pnl: number }[] | undefined,
    security: securityForSummary,
  });

  result.meta = {
    sources,
    fetchTimeMs: Date.now() - startMs,
  };

  return result;
}
