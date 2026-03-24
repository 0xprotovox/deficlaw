/**
 * Format analysis output — clean, readable, both summary + detailed numbers
 */

function fmt(n: number): string {
  if (n === 0) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  if (Math.abs(n) >= 0.001) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function arrow(n: number): string {
  if (n > 0) return `+${n.toFixed(2)}% 📈`;
  if (n < 0) return `${n.toFixed(2)}% 📉`;
  return '0% ➖';
}

function shortenAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatAnalysis(data: any): string {
  const lines: string[] = [];

  // ═══════ SUMMARY ═══════
  if (data.summary) {
    lines.push('═══ SUMMARY ═══');
    lines.push(data.summary);
    lines.push('');
  }

  // ═══════ TOKEN INFO ═══════
  lines.push('═══ TOKEN ═══');
  lines.push(`Name: ${data.token.name} (${data.token.symbol})`);
  lines.push(`Chain: ${data.token.chain}`);
  lines.push(`Address: ${data.token.address}`);
  lines.push(`Age: ${data.token.age}`);
  if (data.token.createdAt) lines.push(`Created: ${data.token.createdAt}`);
  lines.push('');

  // ═══════ PRICE ═══════
  lines.push('═══ PRICE ═══');
  lines.push(`Price: ${fmt(data.price.usd)}`);
  lines.push(`5min: ${arrow(data.price.change5m)}`);
  lines.push(`1h:   ${arrow(data.price.change1h)}`);
  lines.push(`6h:   ${arrow(data.price.change6h)}`);
  lines.push(`24h:  ${arrow(data.price.change24h)}`);
  lines.push('');

  // ═══════ MARKET ═══════
  lines.push('═══ MARKET ═══');
  lines.push(`Market Cap: ${fmt(data.market.marketCap)}`);
  lines.push(`FDV: ${fmt(data.market.fdv)}`);
  lines.push(`Liquidity: ${fmt(data.market.liquidity)}`);
  lines.push(`Volume 24h: ${fmt(data.market.volume24h)}`);
  lines.push(`Volume 6h: ${fmt(data.market.volume6h)}`);
  lines.push(`Volume 1h: ${fmt(data.market.volume1h)}`);
  lines.push(`Volume 5m: ${fmt(data.market.volume5m)}`);
  lines.push(`Vol/Liq Ratio: ${data.market.volumeLiquidityRatio}x`);
  lines.push(`DEX: ${data.market.dex}`);
  lines.push(`Pair: ${data.market.pairAddress}`);
  lines.push('');

  // ═══════ SECURITY ═══════
  if (data.security) {
    lines.push('═══ SECURITY ═══');
    const mintOk = data.security.mintAuthority === 'revoked';
    const freezeOk = data.security.freezeAuthority === 'revoked';
    lines.push(`Mint Authority: ${mintOk ? '✅ Revoked (safe)' : '⚠️ ACTIVE (can print tokens!)'}`);
    lines.push(`Freeze Authority: ${freezeOk ? '✅ Revoked (safe)' : '⚠️ ACTIVE (can freeze wallets!)'}`);
    lines.push(`Total Supply: ${Math.round(data.security.supply).toLocaleString()}`);
    lines.push(`Decimals: ${data.security.decimals}`);
    lines.push('');
  }

  // ═══════ RISK ═══════
  lines.push('═══ RISK ═══');
  const riskMap: Record<string, string> = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', CRITICAL: '🔴' };
  const riskEmoji = riskMap[data.risk.level] || '⚪';
  lines.push(`Score: ${data.risk.score}/100 ${riskEmoji} ${data.risk.level}`);
  if (data.risk.flags?.length > 0) {
    data.risk.flags.forEach((f: any) => {
      const sevMap: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
      const fEmoji = sevMap[f.severity] || '⚪';
      lines.push(`  ${fEmoji} ${f.message}`);
    });
  }
  lines.push('');

  // ═══════ HOLDERS ═══════
  if (data.holders) {
    const h = data.holders;
    lines.push('═══ HOLDERS ═══');
    lines.push(`Total Analyzed: ${h.total}`);
    lines.push('');

    // Concentration
    lines.push('Concentration:');
    lines.push(`  Top 5:  ${pct(h.concentration.top5Pct)}`);
    lines.push(`  Top 10: ${pct(h.concentration.top10Pct)}`);
    lines.push(`  Top 20: ${pct(h.concentration.top20Pct)}`);
    lines.push('');

    // Categories
    lines.push('Categories:');
    const cats = h.categories;
    if (cats.diamondHands > 0) lines.push(`  💎 Diamond Hands: ${cats.diamondHands}`);
    if (cats.snipers > 0) lines.push(`  🎯 Snipers: ${cats.snipers}`);
    if (cats.freshWallets > 0) lines.push(`  🆕 Fresh Wallets: ${cats.freshWallets}`);
    if (cats.kols > 0) lines.push(`  👑 KOLs: ${cats.kols}`);
    if (cats.smartMoney > 0) lines.push(`  🧠 Smart Money: ${cats.smartMoney}`);
    if (cats.insiders > 0) lines.push(`  🔑 Insiders: ${cats.insiders}`);
    if (cats.devWallets > 0) lines.push(`  🛠️ Dev Wallets: ${cats.devWallets}`);
    if (cats.photonUsers > 0) lines.push(`  📸 Photon: ${cats.photonUsers}`);
    if (cats.gmgnUsers > 0) lines.push(`  📲 GMGN: ${cats.gmgnUsers}`);
    if (cats.transferIn > 0) lines.push(`  ↗️ Transfer In: ${cats.transferIn}`);
    lines.push('');

    // Sentiment
    lines.push('Sentiment:');
    lines.push(`  Profitable: ${h.sentiment.profitableHolders} (${pct(h.sentiment.profitRatio)})`);
    lines.push(`  Losing: ${h.sentiment.losingHolders}`);
    lines.push(`  Total PnL: ${fmt(h.sentiment.totalPnlUsd)}`);
    lines.push(`  Total Cost: ${fmt(h.sentiment.totalCostUsd)}`);
    lines.push(`  Avg PnL/holder: ${fmt(h.sentiment.avgPnlPerHolder)}`);
    lines.push('');

    // Buy/Sell Pressure
    lines.push('Buy/Sell Pressure:');
    lines.push(`  Buy TX: ${h.pressure.totalBuyTx}`);
    lines.push(`  Sell TX: ${h.pressure.totalSellTx}`);
    lines.push(`  Ratio: ${h.pressure.buySellRatio.toFixed(2)}:1 ${h.pressure.buySellRatio > 1.5 ? '🟢' : h.pressure.buySellRatio < 0.7 ? '🔴' : '🟡'}`);
    lines.push('');

    // Dev Wallet
    if (h.devWallet) {
      lines.push('Dev Wallet:');
      lines.push(`  Address: ${shortenAddr(h.devWallet.address)}`);
      lines.push(`  Holding: ${pct(h.devWallet.holdingPercent)}`);
      lines.push(`  PnL: ${fmt(h.devWallet.pnl)}`);
      lines.push(`  Status: ${h.devWallet.status}`);
      lines.push('');
    }

    // Top 20 Holders Table
    lines.push('Top 20 Holders:');
    lines.push('  #  | Address      | Supply  | Value     | PnL        | Tags');
    lines.push('  ---|-------------|---------|-----------|------------|------');
    h.topHolders.slice(0, 20).forEach((holder: any, i: number) => {
      const num = String(i + 1).padStart(2);
      const addr = shortenAddr(holder.address).padEnd(12);
      const supply = pct(holder.supplyPercent).padStart(6);
      const value = fmt(holder.valueUsd).padStart(9);
      const pnl = (holder.pnl >= 0 ? '+' : '') + fmt(holder.pnl);
      const tags = holder.tags.filter((t: string) => !/^TOP\d+$/.test(t)).join(', ') || '-';
      const twitter = holder.twitterHandle ? ` @${holder.twitterHandle}` : '';
      lines.push(`  ${num} | ${addr} | ${supply} | ${value} | ${pnl.padStart(10)} | ${tags}${twitter}`);
    });
    lines.push('');
  }

  // ═══════ LP DETECTION ═══════
  if (data.lpDetection) {
    lines.push('═══ LP POOL ═══');
    lines.push(`Top holder is LP pool: ✅`);
    lines.push(`LP Address: ${shortenAddr(data.lpDetection.lpAddress)}`);
    lines.push(`LP holds: ${pct(data.lpDetection.lpPercent)}`);
    if (data.lpDetection.realTopHolder) {
      lines.push(`Real top holder: ${shortenAddr(data.lpDetection.realTopHolder.address)} (${pct(data.lpDetection.realTopHolder.percent)})`);
    }
    lines.push('');
  }

  // ═══════ KOLs ═══════
  if (data.kols && data.kols.length > 0) {
    lines.push('═══ KOLs ═══');
    data.kols.forEach((k: any, i: number) => {
      const handle = k.twitterHandle ? `@${k.twitterHandle}` : shortenAddr(k.address);
      const pnlStr = k.pnl !== 0 ? ` | PnL: ${fmt(k.pnl)}` : '';
      const status = k.status === 'selling' ? '🔴 selling' : '🟢 holding';
      const tags = k.tags.filter((t: string) => !/^TOP\d+$/.test(t) && t !== 'kol').join(', ');
      lines.push(`  ${i + 1}. ${handle} | ${status}${pnlStr}${tags ? ` | ${tags}` : ''}`);
    });
    lines.push('');
  }

  // ═══════ SOCIALS ═══════
  if (data.socials) {
    lines.push('═══ SOCIALS ═══');
    if (data.socials.websites?.length > 0) lines.push(`Website: ${data.socials.websites.join(', ')}`);
    if (data.socials.twitter) lines.push(`Twitter: ${data.socials.twitter}`);
    if (data.socials.telegram) lines.push(`Telegram: ${data.socials.telegram}`);
    lines.push('');
  }

  // ═══════ META ═══════
  lines.push('═══ META ═══');
  lines.push(`Sources: ${data.meta.sources.join(' + ')}`);
  lines.push(`Fetch time: ${(data.meta.fetchTimeMs / 1000).toFixed(1)}s`);

  return lines.join('\n');
}
