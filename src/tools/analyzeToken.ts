/**
 * analyze_token tool — Deep token analysis
 * DexScreener (price/volume/liquidity) + GMGN (holders/insiders/risk)
 * All FREE, no paid APIs
 */
import { getTokenPair } from '../sources/dexscreener.js';
import * as gmgn from '../sources/gmgn.js';
import { getTokenSecurity, isLikelyLpPool } from '../sources/solanaRpc.js';
import { scoreRisk } from '../analysis/riskScorer.js';
import { generateSummary } from '../analysis/summaryGenerator.js';
import type { TokenAnalysis, Holder } from '../types/index.js';

function classifyHolders(holders: Holder[]) {
  const sorted = [...holders].sort((a, b) => b.supplyPercent - a.supplyPercent);

  const devWallets = holders.filter(h => h.isDeployer);
  const freshWallets = holders.filter(h => h.isFreshWallet);
  const snipers = holders.filter(h => h.tags.some(t => /sniper|bot|sandwich/i.test(t)));
  const kols = holders.filter(h => h.tags.some(t => /kol|renowned|influencer/i.test(t)));
  const smartMoney = holders.filter(h => h.tags.some(t => /smart|fund|whale/i.test(t)));
  const diamondHands = holders.filter(h => h.tags.some(t => /diamond/i.test(t)));
  const insiders = holders.filter(h => h.tags.some(t => /insider|team|early/i.test(t)));
  const photonUsers = holders.filter(h => h.tags.some(t => /photon/i.test(t)));
  const gmgnUsers = holders.filter(h => h.tags.some(t => /gmgn/i.test(t)));
  const transferIn = holders.filter(h => h.tags.some(t => /transfer_in/i.test(t)));

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

  // Average hold time (from lastActiveAt)
  const activeDates = holders
    .filter(h => h.lastActiveAt)
    .map(h => new Date(h.lastActiveAt!).getTime());
  const avgLastActive = activeDates.length > 0
    ? new Date(activeDates.reduce((s, d) => s + d, 0) / activeDates.length).toISOString()
    : null;

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
      buySellRatio: totalSellVolume > 0 ? totalBuyVolume / totalSellVolume : totalBuyVolume > 0 ? Infinity : 0,
      totalBuyTx,
      totalSellTx,
    },
    avgLastActive,
    devWallet: devWallets[0] ? {
      address: devWallets[0].address,
      holdingPercent: devWallets[0].supplyPercent,
      pnl: devWallets[0].totalPnl,
      sellAmount: devWallets[0].sellAmount,
      buyAmount: devWallets[0].buyAmount,
      status: devWallets[0].sellAmount > devWallets[0].buyAmount * 0.8 ? 'sold_most'
        : devWallets[0].sellAmount > 0 ? 'selling' : 'holding',
    } : null,
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
}): Promise<TokenAnalysis | { error: string }> {
  const chain = args.chain || 'solana';
  const includeHolders = args.include_holders !== false;
  const startMs = Date.now();
  const sources: string[] = [];

  // 1. DexScreener
  const pair = await getTokenPair(args.address, chain);
  if (!pair) {
    return { error: `Token not found on DexScreener: ${args.address} (${chain})` };
  }
  sources.push('dexscreener');

  // Token age
  const ageMs = pair.pairCreatedAt ? Date.now() - pair.pairCreatedAt : 0;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const ageStr = ageDays < 1 ? `${Math.round(ageDays * 24)}h`
    : ageDays < 30 ? `${Math.round(ageDays)}d`
    : `${Math.round(ageDays / 30)}mo`;

  // Volume/liquidity ratio (higher = more active trading)
  const volumeLiquidityRatio = (pair.liquidity?.usd || 0) > 0
    ? (pair.volume?.h24 || 0) / pair.liquidity.usd
    : 0;

  // 2. GMGN holders
  let holderAnalysis: ReturnType<typeof classifyHolders> | undefined;
  let kolHolders: Holder[] = [];
  let holderError: string | null = null;
  let allHolders: Holder[] = [];

  if (includeHolders && chain === 'solana') {
    if (!(await gmgn.isPlaywrightAvailable())) {
      holderError = 'Playwright not installed. Run: npm install playwright && npx playwright install chromium';
    } else {
      try {
        const data = await gmgn.getHolders(args.address);
        allHolders = data.holders;
        kolHolders = data.kolHolders;
        holderAnalysis = classifyHolders(allHolders);
        sources.push('gmgn');
      } catch (err: any) {
        holderError = `GMGN scrape failed: ${err.message}`;
      }
    }
  }

  // 3. Risk scoring
  const risk = scoreRisk(pair, allHolders.length > 0 ? allHolders : undefined);

  // 4. Build result
  const result: any = {
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
      change5m: pair.priceChange?.m5 || 0,
      change1h: pair.priceChange?.h1 || 0,
      change6h: pair.priceChange?.h6 || 0,
      change24h: pair.priceChange?.h24 || 0,
    },
    market: {
      marketCap: pair.marketCap || 0,
      fdv: pair.fdv || 0,
      volume24h: pair.volume?.h24 || 0,
      volume6h: pair.volume?.h6 || 0,
      volume1h: pair.volume?.h1 || 0,
      volume5m: pair.volume?.m5 || 0,
      liquidity: pair.liquidity?.usd || 0,
      volumeLiquidityRatio: Math.round(volumeLiquidityRatio * 100) / 100,
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

  // 5. Token security (Solana RPC — free)
  if (chain === 'solana') {
    try {
      const [security, topIsLp] = await Promise.all([
        getTokenSecurity(args.address),
        holderAnalysis?.topHolders[0]
          ? isLikelyLpPool(holderAnalysis.topHolders[0].address)
          : Promise.resolve(false),
      ]);

      if (security) {
        result.security = {
          mintAuthority: security.mintAuthority,
          freezeAuthority: security.freezeAuthority,
          supply: security.supply,
          decimals: security.decimals,
        };
        sources.push('solana-rpc');
      }

      if (topIsLp && holderAnalysis) {
        result.lpDetection = {
          topHolderIsLp: true,
          lpAddress: holderAnalysis.topHolders[0].address,
          lpPercent: holderAnalysis.topHolders[0].supplyPercent,
          realTopHolder: holderAnalysis.topHolders[1]
            ? { address: holderAnalysis.topHolders[1].address, percent: holderAnalysis.topHolders[1].supplyPercent }
            : null,
        };
      }
    } catch { /* security check failed, non-critical */ }
  }

  // Socials from DexScreener
  if (pair.info?.websites || pair.info?.socials) {
    result.socials = {
      websites: pair.info.websites?.map(w => w.url) || [],
      twitter: pair.info.socials?.find(s => s.type === 'twitter')?.url || null,
      telegram: pair.info.socials?.find(s => s.type === 'telegram')?.url || null,
    };
  }

  // 6. Generate human-readable summary
  result.summary = generateSummary({
    token: result.token,
    price: result.price,
    market: result.market,
    risk: result.risk,
    holders: holderAnalysis,
    kols: result.kols,
    security: result.security ? {
      mintAuthority: result.security.mintAuthority,
      freezeAuthority: result.security.freezeAuthority,
      isLpTopHolder: result.lpDetection?.topHolderIsLp || false,
      realTopHolderPct: result.lpDetection?.realTopHolder?.percent || 0,
    } : undefined,
  });

  result.meta = {
    sources,
    fetchTimeMs: Date.now() - startMs,
  };

  return result;
}
