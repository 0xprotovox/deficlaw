/**
 * get_top_traders tool — Who made/lost money on a token
 * Uses GMGN holder data already collected by analyze_token
 */
import * as gmgn from '../sources/gmgn.js';

export async function handleGetTopTraders(args: { address: string; limit?: number }) {
  const limit = args.limit || 10;

  if (!(await gmgn.isPlaywrightAvailable())) {
    return { error: 'Playwright not installed. Run: npm install playwright && npx playwright install chromium' };
  }

  const { holders } = await gmgn.getHolders(args.address);
  if (holders.length === 0) return { error: 'No holder data found' };

  const withPnl = holders.filter(h => h.totalPnl !== 0);
  const winners = [...withPnl].sort((a, b) => b.totalPnl - a.totalPnl).slice(0, limit);
  const losers = [...withPnl].sort((a, b) => a.totalPnl - b.totalPnl).slice(0, limit);

  const totalProfit = withPnl.filter(h => h.totalPnl > 0).reduce((s, h) => s + h.totalPnl, 0);
  const totalLoss = withPnl.filter(h => h.totalPnl < 0).reduce((s, h) => s + h.totalPnl, 0);

  const format = (h: typeof holders[0]) => ({
    address: h.address,
    pnl: Math.round(h.totalPnl * 100) / 100,
    profitMultiple: Math.round(h.profitMultiple * 100) / 100,
    tags: h.tags,
    twitterHandle: h.twitterHandle,
    buyTx: h.buyTxCount,
    sellTx: h.sellTxCount,
    stillHolding: h.balance > 0,
    isDeployer: h.isDeployer,
    isDiamondHands: h.tags.some(t => /diamond/i.test(t)),
  });

  return {
    token: args.address,
    totalHoldersAnalyzed: holders.length,
    profitSummary: {
      totalProfit: Math.round(totalProfit),
      totalLoss: Math.round(totalLoss),
      profitableCount: withPnl.filter(h => h.totalPnl > 0).length,
      losingCount: withPnl.filter(h => h.totalPnl < 0).length,
    },
    topWinners: winners.map(format),
    topLosers: losers.map(format),
  };
}
