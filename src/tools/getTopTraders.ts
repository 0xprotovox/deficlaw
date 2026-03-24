/**
 * get_top_traders tool — Who made/lost money on a token.
 * Uses GMGN holder data to rank traders by PnL.
 */
import * as gmgn from '../sources/gmgn.js';
import type { Holder } from '../types/index.js';

interface TraderInfo {
  address: string;
  pnl: number;
  profitMultiple: number;
  tags: string[];
  twitterHandle: string | null;
  buyTx: number;
  sellTx: number;
  stillHolding: boolean;
  isDeployer: boolean;
  isDiamondHands: boolean;
}

function formatTrader(h: Holder): TraderInfo {
  return {
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
  };
}

export async function handleGetTopTraders(args: { address: string; limit?: number }) {
  if (!args.address || args.address.trim().length === 0) {
    return { error: 'Token address is required' };
  }

  const limit = Math.min(Math.max(1, args.limit || 10), 50);

  const { holders } = await gmgn.getHolders(args.address);

  if (holders.length === 0) {
    return { error: `No holder data found for ${args.address}. The token may not be indexed by GMGN.` };
  }

  const withPnl = holders.filter(h => h.totalPnl !== 0);

  if (withPnl.length === 0) {
    return {
      token: args.address,
      totalHoldersAnalyzed: holders.length,
      note: 'No PnL data available for any holders. All holders may have entered at the same price.',
      profitSummary: { totalProfit: 0, totalLoss: 0, profitableCount: 0, losingCount: 0 },
      topWinners: [],
      topLosers: [],
    };
  }

  const winners = [...withPnl].sort((a, b) => b.totalPnl - a.totalPnl).slice(0, limit);
  const losers = [...withPnl].sort((a, b) => a.totalPnl - b.totalPnl).slice(0, limit);

  const profitable = withPnl.filter(h => h.totalPnl > 0);
  const losing = withPnl.filter(h => h.totalPnl < 0);
  const totalProfit = profitable.reduce((s, h) => s + h.totalPnl, 0);
  const totalLoss = losing.reduce((s, h) => s + h.totalPnl, 0);

  return {
    token: args.address,
    totalHoldersAnalyzed: holders.length,
    profitSummary: {
      totalProfit: Math.round(totalProfit),
      totalLoss: Math.round(totalLoss),
      profitableCount: profitable.length,
      losingCount: losing.length,
    },
    topWinners: winners.map(formatTrader),
    topLosers: losers.map(formatTrader),
  };
}
