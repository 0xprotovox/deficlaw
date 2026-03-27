/**
 * Summary Generator — produces human-readable token analysis from raw data.
 * No API calls needed; all logic is rule-based.
 */

interface SummaryInput {
  token: { symbol: string; name: string; age: string };
  price: { usd: number; change1h: number; change6h: number; change24h: number; change5m: number };
  market: { marketCap: number; volume24h: number; volume1h: number; volume5m?: number; liquidity: number; volumeLiquidityRatio: number; dex: string };
  risk: { score: number; level: string };
  holders?: {
    total: number;
    concentration: { top5Pct: number; top10Pct: number; top20Pct: number };
    categories: Record<string, number>;
    sentiment: { profitableHolders: number; losingHolders: number; profitRatio: number; totalPnlUsd: number; avgPnlPerHolder: number };
    pressure: { buySellRatio: number; totalBuyTx: number; totalSellTx: number };
    devWallet: { status: string; holdingPercent: number } | null;
  };
  kols?: { twitterHandle: string | null; status: string; pnl: number }[];
  security?: { mintAuthority: string; freezeAuthority: string; isLpTopHolder: boolean; realTopHolderPct: number };
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function generateSummary(data: SummaryInput): string {
  const lines: string[] = [];
  const { token, price, market, risk, holders, kols, security } = data;

  // ── Opening line: what is this token? ──
  const dexName = market.dex === 'pumpswap' ? 'PumpSwap'
    : market.dex === 'raydium' ? 'Raydium'
    : market.dex === 'orca' ? 'Orca'
    : market.dex === 'meteora' ? 'Meteora'
    : market.dex;
  lines.push(`${token.symbol} is a ${token.age} old ${dexName} token with ${fmt(market.liquidity)} liquidity and ${fmt(market.marketCap)} market cap.`);

  // ── Price action ──
  const priceSignals: string[] = [];

  // Short-term momentum (5m/1h)
  if (Math.abs(price.change5m) > 10) {
    priceSignals.push(price.change5m > 0
      ? `pumping ${price.change5m.toFixed(0)}% in the last 5 minutes`
      : `dumping ${Math.abs(price.change5m).toFixed(0)}% in the last 5 minutes`);
  }

  // 24h trend
  if (Math.abs(price.change24h) > 50) {
    priceSignals.push(price.change24h > 0
      ? `up ${price.change24h.toFixed(0)}% in 24h, explosive move`
      : `crashed ${Math.abs(price.change24h).toFixed(0)}% in 24h`);
  } else if (Math.abs(price.change24h) > 20) {
    priceSignals.push(price.change24h > 0
      ? `up ${price.change24h.toFixed(0)}% in 24h, strong momentum`
      : `down ${Math.abs(price.change24h).toFixed(0)}% in 24h, heavy selling`);
  } else if (Math.abs(price.change24h) > 5) {
    priceSignals.push(price.change24h > 0
      ? `up ${price.change24h.toFixed(1)}% today`
      : `down ${Math.abs(price.change24h).toFixed(1)}% today`);
  } else {
    priceSignals.push('price is flat today');
  }

  // Divergence between timeframes
  if (price.change1h > 10 && price.change24h < -10) {
    priceSignals.push('bouncing after a sell-off');
  } else if (price.change1h < -10 && price.change24h > 10) {
    priceSignals.push('selling off after earlier gains');
  }

  // Volume signals
  if (market.volume1h === 0 && market.volume24h < 1000) {
    priceSignals.push('volume is dead right now');
  } else if (market.volume1h > market.volume24h * 0.2 && market.volume1h > 0) {
    priceSignals.push('volume spiking in the last hour');
  }

  if (market.volumeLiquidityRatio < 0.1 && market.volume24h > 0) {
    priceSignals.push('very low trading activity relative to liquidity');
  } else if (market.volumeLiquidityRatio > 5) {
    priceSignals.push('extreme turnover, massive volume relative to pool size');
  } else if (market.volumeLiquidityRatio > 2) {
    priceSignals.push('high turnover, lots of trading relative to pool size');
  }

  if (priceSignals.length > 0) {
    const first = priceSignals[0];
    const rest = priceSignals.slice(1);
    lines.push(first[0].toUpperCase() + first.slice(1) + (rest.length > 0 ? ', ' + rest.join(', ') : '') + '.');
  }

  // ── Holder analysis ──
  if (holders) {
    const { concentration, categories, sentiment, pressure, devWallet } = holders;

    // Concentration insight
    if (concentration.top5Pct > 0.50) {
      lines.push(`Top 5 wallets control ${pct(concentration.top5Pct)} of supply, very concentrated.`);
    } else if (concentration.top10Pct > 0.50) {
      lines.push(`Top 10 hold ${pct(concentration.top10Pct)}, moderately concentrated.`);
    } else if (concentration.top10Pct < 0.20) {
      lines.push(`Supply is broadly distributed, top 10 hold only ${pct(concentration.top10Pct)}.`);
    } else {
      lines.push(`Supply is well distributed, top 10 hold ${pct(concentration.top10Pct)}.`);
    }

    // Diamond hands
    if (categories.diamondHands > 0 && categories.diamondHands > holders.total * 0.4) {
      lines.push(`${categories.diamondHands} diamond hands (${pct(categories.diamondHands / holders.total)}), strong holder conviction.`);
    } else if (categories.diamondHands > 0 && categories.diamondHands > holders.total * 0.2) {
      lines.push(`${categories.diamondHands} diamond hands among holders, decent conviction.`);
    }

    // Profit/loss sentiment
    if (sentiment.profitRatio < 0.10 && holders.total > 5) {
      lines.push(`Almost nobody is in profit (${pct(sentiment.profitRatio)}), most holders are deep underwater with avg loss of ${fmt(Math.abs(sentiment.avgPnlPerHolder))} per wallet.`);
    } else if (sentiment.profitRatio < 0.20) {
      lines.push(`Only ${pct(sentiment.profitRatio)} of holders are in profit, most are underwater with avg loss of ${fmt(Math.abs(sentiment.avgPnlPerHolder))} per wallet.`);
    } else if (sentiment.profitRatio > 0.70) {
      lines.push(`${pct(sentiment.profitRatio)} of holders are profitable, very healthy sentiment.`);
    } else if (sentiment.profitRatio > 0.50) {
      lines.push(`${pct(sentiment.profitRatio)} of holders are profitable, healthy sentiment.`);
    } else {
      lines.push(`${pct(sentiment.profitRatio)} in profit, ${pct(1 - sentiment.profitRatio)} underwater.`);
    }

    // Buy/sell pressure
    // Guard against misleading ratios from near-zero tx counts (e.g., 0 buys / 1 sell)
    const totalTx = pressure.totalBuyTx + pressure.totalSellTx;
    if (totalTx < 3) {
      lines.push(`Very low trading activity (${pressure.totalBuyTx} buys, ${pressure.totalSellTx} sells), not enough data for pressure analysis.`);
    } else if (pressure.buySellRatio > 5) {
      lines.push(`Extreme buy pressure at ${pressure.buySellRatio.toFixed(1)}:1 ratio (${pressure.totalBuyTx} buys vs ${pressure.totalSellTx} sells), heavy accumulation.`);
    } else if (pressure.buySellRatio > 3) {
      lines.push(`Buy pressure is strong at ${pressure.buySellRatio.toFixed(1)}:1 ratio (${pressure.totalBuyTx} buys vs ${pressure.totalSellTx} sells), accumulation phase.`);
    } else if (pressure.buySellRatio > 1.5) {
      lines.push(`More buying than selling (${pressure.buySellRatio.toFixed(1)}:1), slight accumulation.`);
    } else if (pressure.buySellRatio < 0.3 && pressure.totalSellTx > 0) {
      lines.push(`Massive sell pressure (${pressure.buySellRatio.toFixed(2)}:1), panic selling.`);
    } else if (pressure.buySellRatio < 0.5 && pressure.totalSellTx > 0) {
      lines.push(`Heavy sell pressure (${pressure.buySellRatio.toFixed(2)}:1), distribution phase.`);
    } else if (pressure.totalBuyTx === 0 && pressure.totalSellTx === 0) {
      lines.push(`No recent buy/sell activity detected.`);
    } else {
      lines.push(`Buy/sell pressure is balanced.`);
    }

    // Snipers & fresh wallets
    if (categories.snipers > 5) {
      lines.push(`${categories.snipers} sniper/bot wallets detected, high dump risk.`);
    } else if (categories.snipers > 3) {
      lines.push(`${categories.snipers} sniper wallets detected, watch for dumps.`);
    }

    if (categories.freshWallets > holders.total * 0.30) {
      lines.push(`${pct(categories.freshWallets / holders.total)} fresh wallets, highly likely bundled or wash traded.`);
    } else if (categories.freshWallets > holders.total * 0.20) {
      lines.push(`${pct(categories.freshWallets / holders.total)} fresh wallets, possible wash trading or bundle.`);
    }

    // Smart money presence
    if (categories.smartMoney > 0) {
      lines.push(`${categories.smartMoney} smart money wallet${categories.smartMoney > 1 ? 's' : ''} detected.`);
    }

    // Dev wallet
    if (devWallet) {
      if (devWallet.status === 'sold_most') {
        lines.push(`Dev wallet sold most of their tokens, no longer aligned with holders.`);
      } else if (devWallet.status === 'selling') {
        lines.push(`Dev is actively selling, holding ${pct(devWallet.holdingPercent)}.`);
      } else if (devWallet.holdingPercent > 0.10) {
        lines.push(`Dev still holding ${pct(devWallet.holdingPercent)}, large position.`);
      } else {
        lines.push(`Dev still holding ${pct(devWallet.holdingPercent)}, aligned with project.`);
      }
    } else if (holders.total > 0) {
      lines.push(`No dev wallet detected in top holders.`);
    }
  }

  // ── KOL analysis ──
  if (kols && kols.length > 0) {
    const kolsSelling = kols.filter(k => k.status === 'selling');
    const kolsHolding = kols.filter(k => k.status === 'holding');
    const kolsProfitable = kols.filter(k => k.pnl > 0);

    lines.push(`${kols.length} KOL${kols.length > 1 ? 's' : ''} tracked: ${kolsHolding.length} holding, ${kolsSelling.length} selling.`);

    if (kolsSelling.length > kolsHolding.length && kols.length >= 3) {
      lines.push(`Most KOLs are exiting, bearish signal.`);
    } else if (kolsHolding.length > kols.length * 0.7) {
      lines.push(`Strong KOL conviction, most still holding.`);
    } else if (kolsHolding.length > kols.length * 0.5) {
      lines.push(`Majority of KOLs still holding.`);
    }

    if (kolsProfitable.length === 0 && kols.length > 3) {
      lines.push(`None of the KOLs are profitable on this token.`);
    } else if (kolsProfitable.length === kols.length && kols.length > 1) {
      lines.push(`All tracked KOLs are in profit.`);
    }
  }

  // ── Security ──
  if (security) {
    const securityIssues: string[] = [];
    if (security.mintAuthority === 'active') securityIssues.push('mint authority is active (dev can print tokens)');
    if (security.freezeAuthority === 'active') securityIssues.push('freeze authority active (tokens can be frozen)');

    if (securityIssues.length > 0) {
      lines.push(`Security concerns: ${securityIssues.join(', ')}.`);
    } else {
      lines.push(`Contract looks safe: mint and freeze authorities revoked.`);
    }

    if (security.isLpTopHolder) {
      lines.push(`Top holder is the LP pool, real top holder owns ${pct(security.realTopHolderPct)}.`);
    }
  }

  // ── Risk verdict ──
  if (risk.level === 'CRITICAL') {
    lines.push(`HIGH RISK: multiple red flags, extreme caution advised.`);
  } else if (risk.level === 'HIGH') {
    lines.push(`Elevated risk, do thorough research before entering.`);
  } else if (risk.level === 'MEDIUM') {
    lines.push(`Moderate risk, some concerns but nothing critical.`);
  } else {
    lines.push(`Lower risk profile based on available data.`);
  }

  // ── Final actionable insight (pattern-matching) ──
  if (market.volume1h === 0 && market.volume24h < 500) {
    lines.push(`Token appears dormant. Check if community and socials are still active before entering.`);
  }

  if (holders) {
    // Accumulation despite underwater holders
    if (holders.pressure.buySellRatio > 3 && holders.sentiment.profitRatio < 0.25) {
      lines.push(`Interesting setup: strong buy pressure despite most holders being underwater. Could mean accumulation before a move, or dead cat buying.`);
    }

    // Diamond hands conviction despite losses
    if (holders.categories.diamondHands > holders.total * 0.5 && holders.sentiment.profitRatio < 0.2) {
      lines.push(`Holders refuse to sell despite being down. Either strong conviction or stuck with illiquid bags.`);
    }

    // Insider/smart money accumulating while others sell
    if (holders.categories.smartMoney > 0 && holders.pressure.buySellRatio < 0.8 && price.change24h < -15) {
      lines.push(`Smart money present while others are selling. Watch for reversal signals.`);
    }

    // Warning: all KOLs selling + high concentration
    if (kols && kols.length > 2 && kols.every(k => k.status === 'selling') &&
        holders.concentration.top10Pct > 0.40) {
      lines.push(`All KOLs exiting combined with high concentration. Significant dump risk.`);
    }
  }

  // ── Actionable Verdict (data-driven signal) ──
  const verdict = computeVerdict(data);
  lines.push('');
  lines.push(`VERDICT: ${verdict.signal}`);
  lines.push(verdict.reason);
  lines.push('(Not financial advice. This is a data-driven signal based on on-chain metrics only.)');

  return lines.join('\n');
}

interface Verdict {
  signal: 'BUY SIGNAL' | 'NEUTRAL' | 'SELL SIGNAL' | 'AVOID';
  reason: string;
}

function computeVerdict(data: SummaryInput): Verdict {
  const { price, market, risk, holders, kols } = data;

  // AVOID: critical risk or very low liquidity
  if (risk.score >= 70 || market.liquidity < 1000) {
    return { signal: 'AVOID', reason: 'Too many red flags. Critical risk score or dangerously low liquidity.' };
  }

  // AVOID: zero volume dead token
  if (market.volume24h < 500 && market.volume1h === 0) {
    return { signal: 'AVOID', reason: 'Token appears dead with no trading activity.' };
  }

  let bullPoints = 0;
  let bearPoints = 0;

  // Price momentum
  if (price.change24h > 20) bullPoints += 2;
  else if (price.change24h > 5) bullPoints += 1;
  else if (price.change24h < -20) bearPoints += 2;
  else if (price.change24h < -5) bearPoints += 1;

  if (price.change1h > 10) bullPoints += 1;
  else if (price.change1h < -10) bearPoints += 1;

  // Volume health
  if (market.volumeLiquidityRatio > 2 && market.volumeLiquidityRatio < 10) bullPoints += 1;
  else if (market.volumeLiquidityRatio > 10) bearPoints += 1; // suspicious

  // Holder sentiment
  if (holders) {
    if (holders.sentiment.profitRatio > 0.50) bullPoints += 1;
    else if (holders.sentiment.profitRatio < 0.15) bearPoints += 1;

    // Only count buy/sell ratio as a signal if there are enough transactions
    const totalTxForVerdict = holders.pressure.totalBuyTx + holders.pressure.totalSellTx;
    if (totalTxForVerdict >= 5) {
      if (holders.pressure.buySellRatio > 2) bullPoints += 1;
      else if (holders.pressure.buySellRatio < 0.5) bearPoints += 1;
    }

    if (holders.concentration.top10Pct > 0.50) bearPoints += 1;
    if (holders.categories.snipers > 5) bearPoints += 1;
    if (holders.categories.smartMoney > 0) bullPoints += 1;
    if (holders.categories.diamondHands > holders.total * 0.3) bullPoints += 1;
  }

  // KOL sentiment
  if (kols && kols.length >= 2) {
    const holding = kols.filter(k => k.status === 'holding').length;
    if (holding > kols.length * 0.7) bullPoints += 1;
    if (holding < kols.length * 0.3) bearPoints += 1;
  }

  // Risk penalty
  if (risk.score >= 45) bearPoints += 2;
  else if (risk.score >= 20) bearPoints += 1;

  const net = bullPoints - bearPoints;

  if (net >= 3) return { signal: 'BUY SIGNAL', reason: `Strong bullish indicators: ${bullPoints} bull vs ${bearPoints} bear signals. Momentum, holder sentiment, and volume align.` };
  if (net >= 1) return { signal: 'BUY SIGNAL', reason: `Mildly bullish: ${bullPoints} bull vs ${bearPoints} bear signals. Some positive indicators but not overwhelming.` };
  if (net <= -3) return { signal: 'SELL SIGNAL', reason: `Strong bearish indicators: ${bearPoints} bear vs ${bullPoints} bull signals. Consider reducing exposure.` };
  if (net <= -1) return { signal: 'SELL SIGNAL', reason: `Mildly bearish: ${bearPoints} bear vs ${bullPoints} bull signals. Caution advised.` };

  return { signal: 'NEUTRAL', reason: `Mixed signals: ${bullPoints} bull vs ${bearPoints} bear. No clear direction from current data.` };
}
