/**
 * AI-like Summary Generator — code-generated, no API calls
 * Produces human-readable analysis from raw data
 */

interface SummaryInput {
  token: { symbol: string; name: string; age: string };
  price: { usd: number; change1h: number; change6h: number; change24h: number; change5m: number };
  market: { marketCap: number; volume24h: number; volume1h: number; liquidity: number; volumeLiquidityRatio: number; dex: string };
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

  // Opening line — what is this token?
  const dexName = market.dex === 'pumpswap' ? 'PumpSwap' : market.dex === 'raydium' ? 'Raydium' : market.dex;
  lines.push(`${token.symbol} is a ${token.age} old ${dexName} token with ${fmt(market.liquidity)} liquidity and ${fmt(market.marketCap)} market cap.`);

  // Price action
  const priceSignals: string[] = [];
  if (Math.abs(price.change24h) > 20) {
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

  if (market.volume1h === 0 && market.volume24h < 1000) {
    priceSignals.push('volume is dead right now');
  } else if (market.volume1h > market.volume24h * 0.2) {
    priceSignals.push('volume spiking in the last hour');
  }

  if (market.volumeLiquidityRatio < 0.1) {
    priceSignals.push('very low trading activity relative to liquidity');
  } else if (market.volumeLiquidityRatio > 2) {
    priceSignals.push('high turnover, lots of trading relative to pool size');
  }

  lines.push(priceSignals[0][0].toUpperCase() + priceSignals[0].slice(1) + (priceSignals.length > 1 ? ', ' + priceSignals.slice(1).join(', ') : '') + '.');

  // Holder analysis
  if (holders) {
    const { concentration, categories, sentiment, pressure, devWallet } = holders;

    // Concentration
    if (concentration.top5Pct > 0.5) {
      lines.push(`Top 5 wallets control ${pct(concentration.top5Pct)} of supply, very concentrated.`);
    } else if (concentration.top10Pct > 0.5) {
      lines.push(`Top 10 hold ${pct(concentration.top10Pct)}, moderately concentrated.`);
    } else {
      lines.push(`Supply is well distributed, top 10 hold ${pct(concentration.top10Pct)}.`);
    }

    // Diamond hands vs paper hands
    if (categories.diamondHands > holders.total * 0.4) {
      lines.push(`${categories.diamondHands} diamond hands (${pct(categories.diamondHands / holders.total)}), strong holder conviction.`);
    }

    // Profit/loss sentiment
    if (sentiment.profitRatio < 0.2) {
      lines.push(`Only ${pct(sentiment.profitRatio)} of holders are in profit, most are underwater with avg loss of ${fmt(Math.abs(sentiment.avgPnlPerHolder))} per wallet.`);
    } else if (sentiment.profitRatio > 0.5) {
      lines.push(`${pct(sentiment.profitRatio)} of holders are profitable, healthy sentiment.`);
    } else {
      lines.push(`${pct(sentiment.profitRatio)} in profit, ${pct(1 - sentiment.profitRatio)} underwater.`);
    }

    // Buy/sell pressure
    if (pressure.buySellRatio > 3) {
      lines.push(`Buy pressure is strong at ${pressure.buySellRatio.toFixed(1)}:1 ratio (${pressure.totalBuyTx} buys vs ${pressure.totalSellTx} sells), accumulation phase.`);
    } else if (pressure.buySellRatio > 1.5) {
      lines.push(`More buying than selling (${pressure.buySellRatio.toFixed(1)}:1), slight accumulation.`);
    } else if (pressure.buySellRatio < 0.5) {
      lines.push(`Heavy sell pressure (${pressure.buySellRatio.toFixed(2)}:1), distribution phase.`);
    } else {
      lines.push(`Buy/sell pressure is balanced.`);
    }

    // Snipers & fresh wallets
    if (categories.snipers > 3) {
      lines.push(`${categories.snipers} sniper wallets detected, watch for dumps.`);
    }
    if (categories.freshWallets > holders.total * 0.2) {
      lines.push(`${pct(categories.freshWallets / holders.total)} fresh wallets, possible wash trading or bundle.`);
    }

    // Dev wallet
    if (devWallet) {
      if (devWallet.status === 'sold_most') {
        lines.push(`Dev wallet sold most of their tokens, no longer aligned with holders.`);
      } else if (devWallet.status === 'selling') {
        lines.push(`Dev is actively selling, holding ${pct(devWallet.holdingPercent)}.`);
      } else {
        lines.push(`Dev still holding ${pct(devWallet.holdingPercent)}, aligned with project.`);
      }
    } else {
      lines.push(`No dev wallet detected in top holders.`);
    }
  }

  // KOL analysis
  if (kols && kols.length > 0) {
    const kolsWithTwitter = kols.filter(k => k.twitterHandle);
    const kolsSelling = kols.filter(k => k.status === 'selling');
    const kolsHolding = kols.filter(k => k.status === 'holding');
    const kolsProfitable = kols.filter(k => k.pnl > 0);

    lines.push(`${kols.length} KOLs tracked: ${kolsHolding.length} holding, ${kolsSelling.length} selling.`);

    if (kolsSelling.length > kolsHolding.length) {
      lines.push(`Most KOLs are exiting, bearish signal.`);
    } else if (kolsHolding.length > kols.length * 0.6) {
      lines.push(`Majority of KOLs still holding, they see potential.`);
    }

    if (kolsProfitable.length === 0 && kols.length > 3) {
      lines.push(`None of the KOLs are profitable on this token.`);
    }
  }

  // Security
  if (security) {
    const securityIssues: string[] = [];
    if (security.mintAuthority === 'active') securityIssues.push('mint authority is active (dev can print tokens)');
    if (security.freezeAuthority === 'active') securityIssues.push('freeze authority active (tokens can be frozen)');

    if (securityIssues.length > 0) {
      lines.push(`⚠️ Security concerns: ${securityIssues.join(', ')}.`);
    } else {
      lines.push(`Contract looks safe: mint and freeze authorities revoked.`);
    }

    if (security.isLpTopHolder) {
      lines.push(`Top holder is the LP pool, real top holder owns ${pct(security.realTopHolderPct)}.`);
    }
  }

  // Risk verdict
  if (risk.level === 'CRITICAL') {
    lines.push(`🔴 HIGH RISK — multiple red flags, extreme caution advised.`);
  } else if (risk.level === 'HIGH') {
    lines.push(`🟠 Elevated risk, do thorough research before entering.`);
  } else if (risk.level === 'MEDIUM') {
    lines.push(`🟡 Moderate risk, some concerns but nothing critical.`);
  } else {
    lines.push(`🟢 Lower risk profile based on available data.`);
  }

  // Final actionable insight
  if (market.volume1h === 0 && market.volume24h < 500) {
    lines.push(`⚠️ Token appears dormant. Check if community and socials are still active before entering.`);
  } else if (holders && holders.pressure.buySellRatio > 3 && holders.sentiment.profitRatio < 0.25) {
    lines.push(`Interesting setup: strong buy pressure despite most holders being underwater. Could mean accumulation before a move, or dead cat buying.`);
  } else if (holders && holders.categories.diamondHands > holders.total * 0.5 && holders.sentiment.profitRatio < 0.2) {
    lines.push(`Holders refuse to sell despite being down. Either strong conviction or stuck with illiquid bags. Watch volume for signs of life.`);
  }

  return lines.join('\n');
}
