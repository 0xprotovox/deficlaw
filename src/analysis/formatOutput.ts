/**
 * Format analysis output as clean, readable plain text.
 * Both human-readable summary and detailed numbers.
 */

/** Format a number as a dollar amount with appropriate precision */
function fmt(n: number): string {
  if (n === 0) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  if (Math.abs(n) >= 0.001) return `$${n.toFixed(4)}`;
  if (Math.abs(n) >= 0.0000001) return `$${n.toFixed(8)}`;
  return `$${n.toExponential(2)}`;
}

/** Format a decimal as a percentage string */
function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** Format a price change with directional arrow */
function arrow(n: number): string {
  if (n > 0) return `+${n.toFixed(2)}%`;
  if (n < 0) return `${n.toFixed(2)}%`;
  return '0%';
}

/** Shorten a blockchain address for display */
function shortenAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Pad or truncate a string to a fixed width */
function pad(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

/** Right-align a string within a fixed width */
function rpad(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return ' '.repeat(width - str.length) + str;
}

interface AnalysisData {
  summary?: string;
  token: { name: string; symbol: string; chain: string; address: string; age?: string; createdAt?: string };
  price: { usd: number; change5m?: number; change1h: number; change6h?: number; change24h: number };
  market: {
    marketCap: number; fdv: number; liquidity: number;
    volume24h: number; volume6h?: number; volume1h: number; volume5m?: number;
    volumeLiquidityRatio?: number; dex: string; pairAddress: string;
  };
  security?: { mintAuthority: string; freezeAuthority: string; supply: number; decimals: number };
  risk: { score: number; level: string; flags?: { severity: string; message: string }[] };
  holders?: {
    total: number;
    concentration: { top5Pct: number; top10Pct: number; top20Pct: number };
    categories: Record<string, number>;
    sentiment: {
      profitableHolders: number; losingHolders: number; profitRatio: number;
      totalPnlUsd: number; totalCostUsd: number; avgPnlPerHolder: number;
    };
    pressure: { totalBuyTx: number; totalSellTx: number; buySellRatio: number };
    devWallet?: { address: string; holdingPercent: number; pnl: number; status: string } | null;
    topHolders: {
      address: string; tags: string[]; supplyPercent: number; valueUsd: number;
      pnl: number; profitMultiple?: number; buyTx?: number; sellTx?: number;
      isDeployer?: boolean; isFreshWallet?: boolean; twitterHandle?: string | null;
    }[];
  };
  lpDetection?: {
    lpAddress: string; lpPercent: number;
    realTopHolder?: { address: string; percent: number } | null;
  };
  kols?: {
    address?: string; twitterHandle?: string | null; pnl: number;
    status: string; tags: string[];
  }[];
  socials?: { websites?: string[]; twitter?: string | null; telegram?: string | null };
  meta: { sources: string[]; fetchTimeMs: number };
}

export function formatAnalysis(data: AnalysisData): string {
  const lines: string[] = [];

  // ═══════ SUMMARY ═══════
  if (data.summary) {
    lines.push('=== SUMMARY ===');
    lines.push(data.summary);
    lines.push('');
  }

  // ═══════ TOKEN INFO ═══════
  lines.push('=== TOKEN ===');
  lines.push(`Name: ${data.token.name} (${data.token.symbol})`);
  lines.push(`Chain: ${data.token.chain}`);
  lines.push(`Address: ${data.token.address}`);
  if (data.token.age) lines.push(`Age: ${data.token.age}`);
  if (data.token.createdAt) lines.push(`Created: ${data.token.createdAt}`);
  lines.push('');

  // ═══════ PRICE ═══════
  lines.push('=== PRICE ===');
  lines.push(`Price: ${fmt(data.price.usd)}`);
  if (data.price.change5m !== undefined) lines.push(`5min:  ${arrow(data.price.change5m)}`);
  lines.push(`1h:    ${arrow(data.price.change1h)}`);
  if (data.price.change6h !== undefined) lines.push(`6h:    ${arrow(data.price.change6h)}`);
  lines.push(`24h:   ${arrow(data.price.change24h)}`);
  lines.push('');

  // ═══════ MARKET ═══════
  lines.push('=== MARKET ===');
  lines.push(`Market Cap:  ${fmt(data.market.marketCap)}`);
  lines.push(`FDV:         ${fmt(data.market.fdv)}`);
  lines.push(`Liquidity:   ${fmt(data.market.liquidity)}`);
  lines.push(`Volume 24h:  ${fmt(data.market.volume24h)}`);
  if (data.market.volume6h !== undefined) lines.push(`Volume 6h:   ${fmt(data.market.volume6h)}`);
  lines.push(`Volume 1h:   ${fmt(data.market.volume1h)}`);
  if (data.market.volume5m !== undefined) lines.push(`Volume 5m:   ${fmt(data.market.volume5m)}`);
  if (data.market.volumeLiquidityRatio !== undefined) {
    lines.push(`Vol/Liq:     ${data.market.volumeLiquidityRatio}x`);
  }
  lines.push(`DEX:         ${data.market.dex}`);
  lines.push(`Pair:        ${data.market.pairAddress}`);
  lines.push('');

  // ═══════ SECURITY ═══════
  if (data.security) {
    lines.push('=== SECURITY ===');
    const mintOk = data.security.mintAuthority === 'revoked';
    const freezeOk = data.security.freezeAuthority === 'revoked';
    lines.push(`Mint Authority:   ${mintOk ? 'Revoked (safe)' : 'ACTIVE (can print tokens!)'}`);
    lines.push(`Freeze Authority: ${freezeOk ? 'Revoked (safe)' : 'ACTIVE (can freeze wallets!)'}`);
    lines.push(`Total Supply:     ${Math.round(data.security.supply).toLocaleString()}`);
    lines.push(`Decimals:         ${data.security.decimals}`);
    lines.push('');
  }

  // ═══════ RISK ═══════
  lines.push('=== RISK ===');
  const riskIndicator: Record<string, string> = { LOW: '[LOW]', MEDIUM: '[MEDIUM]', HIGH: '[HIGH]', CRITICAL: '[CRITICAL]' };
  lines.push(`Score: ${data.risk.score}/100 ${riskIndicator[data.risk.level] ?? data.risk.level}`);
  if (data.risk.flags && data.risk.flags.length > 0) {
    for (const f of data.risk.flags) {
      const sevIndicator: Record<string, string> = { critical: '[!]', high: '[!]', medium: '[~]', low: '[.]' };
      lines.push(`  ${sevIndicator[f.severity] ?? '   '} ${f.message}`);
    }
  }
  lines.push('');

  // ═══════ HOLDERS ═══════
  if (data.holders) {
    const h = data.holders;
    lines.push('=== HOLDERS ===');
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
    const catEntries: [string, number, string][] = [
      ['diamondHands', h.categories.diamondHands ?? 0, 'Diamond Hands'],
      ['snipers', h.categories.snipers ?? 0, 'Snipers'],
      ['freshWallets', h.categories.freshWallets ?? 0, 'Fresh Wallets'],
      ['kols', h.categories.kols ?? 0, 'KOLs'],
      ['smartMoney', h.categories.smartMoney ?? 0, 'Smart Money'],
      ['insiders', h.categories.insiders ?? 0, 'Insiders'],
      ['devWallets', h.categories.devWallets ?? 0, 'Dev Wallets'],
      ['photonUsers', h.categories.photonUsers ?? 0, 'Photon'],
      ['gmgnUsers', h.categories.gmgnUsers ?? 0, 'GMGN'],
      ['transferIn', h.categories.transferIn ?? 0, 'Transfer In'],
    ];
    for (const [, count, label] of catEntries) {
      if (count > 0) lines.push(`  ${label}: ${count}`);
    }
    lines.push('');

    // Sentiment
    lines.push('Sentiment:');
    lines.push(`  Profitable:     ${h.sentiment.profitableHolders} (${pct(h.sentiment.profitRatio)})`);
    lines.push(`  Losing:         ${h.sentiment.losingHolders}`);
    lines.push(`  Total PnL:      ${fmt(h.sentiment.totalPnlUsd)}`);
    lines.push(`  Total Cost:     ${fmt(h.sentiment.totalCostUsd)}`);
    lines.push(`  Avg PnL/holder: ${fmt(h.sentiment.avgPnlPerHolder)}`);
    lines.push('');

    // Buy/Sell Pressure
    lines.push('Buy/Sell Pressure:');
    lines.push(`  Buy TX:  ${h.pressure.totalBuyTx}`);
    lines.push(`  Sell TX: ${h.pressure.totalSellTx}`);
    const ratioStr = h.pressure.buySellRatio === Infinity
      ? 'all buys'
      : h.pressure.buySellRatio > 10000
        ? `${Math.round(h.pressure.buySellRatio).toLocaleString()}:1 (unreliable, low tx count)`
        : `${h.pressure.buySellRatio.toFixed(2)}:1`;
    const ratioIndicator = h.pressure.buySellRatio > 1.5 ? ' (bullish)'
      : h.pressure.buySellRatio < 0.7 ? ' (bearish)'
      : ' (neutral)';
    lines.push(`  Ratio:   ${ratioStr}${ratioIndicator}`);
    lines.push('');

    // Dev Wallet
    if (h.devWallet) {
      lines.push('Dev Wallet:');
      lines.push(`  Address:  ${shortenAddr(h.devWallet.address)}`);
      lines.push(`  Holding:  ${pct(h.devWallet.holdingPercent)}`);
      lines.push(`  PnL:      ${fmt(h.devWallet.pnl)}`);
      lines.push(`  Status:   ${h.devWallet.status}`);
      lines.push('');
    }

    // Top 20 Holders Table (fixed-width columns for alignment)
    if (h.topHolders.length > 0) {
      lines.push('Top Holders:');
      lines.push(`  ${rpad('#', 3)} ${pad('Address', 13)} ${rpad('Supply', 7)} ${rpad('Value', 10)} ${rpad('PnL', 11)} Tags`);
      lines.push(`  ${'-'.repeat(3)} ${'-'.repeat(13)} ${'-'.repeat(7)} ${'-'.repeat(10)} ${'-'.repeat(11)} ${'----'}`);

      for (let i = 0; i < Math.min(h.topHolders.length, 20); i++) {
        const holder = h.topHolders[i];
        const num = rpad(String(i + 1), 3);
        const addr = pad(shortenAddr(holder.address), 13);
        const supply = rpad(pct(holder.supplyPercent), 7);
        const value = rpad(fmt(holder.valueUsd), 10);
        const pnlSign = holder.pnl >= 0 ? '+' : '';
        const pnlStr = rpad(pnlSign + fmt(holder.pnl), 11);
        const tags = holder.tags
          .filter((t: string) => !/^TOP\d+$/i.test(t))
          .join(', ') || '-';
        const twitter = holder.twitterHandle ? ` @${holder.twitterHandle}` : '';
        lines.push(`  ${num} ${addr} ${supply} ${value} ${pnlStr} ${tags}${twitter}`);
      }
      lines.push('');
    }
  }

  // ═══════ LP DETECTION ═══════
  if (data.lpDetection) {
    lines.push('=== LP POOL ===');
    lines.push(`Top holder is LP pool`);
    lines.push(`LP Address: ${shortenAddr(data.lpDetection.lpAddress)}`);
    lines.push(`LP holds: ${pct(data.lpDetection.lpPercent)}`);
    if (data.lpDetection.realTopHolder) {
      lines.push(`Real top holder: ${shortenAddr(data.lpDetection.realTopHolder.address)} (${pct(data.lpDetection.realTopHolder.percent)})`);
    }
    lines.push('');
  }

  // ═══════ KOLs ═══════
  if (data.kols && data.kols.length > 0) {
    lines.push('=== KOLs ===');
    for (let i = 0; i < data.kols.length; i++) {
      const k = data.kols[i];
      const handle = k.twitterHandle ? `@${k.twitterHandle}` : shortenAddr(k.address ?? 'unknown');
      const pnlStr = k.pnl !== 0 ? ` | PnL: ${fmt(k.pnl)}` : '';
      const status = k.status === 'selling' ? 'selling' : 'holding';
      const tags = k.tags
        .filter((t: string) => !/^TOP\d+$/i.test(t) && t !== 'kol')
        .join(', ');
      lines.push(`  ${i + 1}. ${handle} | ${status}${pnlStr}${tags ? ` | ${tags}` : ''}`);
    }
    lines.push('');
  }

  // ═══════ SOCIALS ═══════
  if (data.socials) {
    lines.push('=== SOCIALS ===');
    if (data.socials.websites && data.socials.websites.length > 0) {
      lines.push(`Website:  ${data.socials.websites.join(', ')}`);
    }
    if (data.socials.twitter) lines.push(`Twitter:  ${data.socials.twitter}`);
    if (data.socials.telegram) lines.push(`Telegram: ${data.socials.telegram}`);
    lines.push('');
  }

  // ═══════ META ═══════
  lines.push('=== META ===');
  lines.push(`Sources:    ${data.meta.sources.join(' + ')}`);
  lines.push(`Fetch time: ${(data.meta.fetchTimeMs / 1000).toFixed(1)}s`);

  return lines.join('\n');
}
