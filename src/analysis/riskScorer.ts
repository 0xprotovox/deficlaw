/**
 * Composite Risk Scorer
 * Combines DexScreener + GMGN data into a 0-100 risk score across 8 dimensions.
 */
import type { DexPair, Holder, RiskAssessment, RiskFlag } from '../types/index.js';
import type { TokenSecurity } from '../sources/solanaRpc.js';

interface RiskOptions {
  pair: DexPair | null;
  holders?: Holder[];
  security?: TokenSecurity | null;
}

/**
 * Score risk from 0 (safe) to 100 (extremely risky).
 *
 * Dimensions and max weights:
 *   1. Liquidity          — 22 pts
 *   2. Token age          — 10 pts
 *   3. Volume anomalies   —  8 pts
 *   4. Holder concentration — 18 pts
 *   5. Dev wallet         — 15 pts
 *   6. Fresh wallets      — 12 pts
 *   7. Sniper activity    — 10 pts
 *   8. Contract security  —  5 pts
 *                         --------
 *                    Max:  100 pts
 */
export function scoreRisk(pairOrOptions: DexPair | null | RiskOptions, holders?: Holder[]): RiskAssessment {
  // Support both old signature (pair, holders) and new options object
  let pair: DexPair | null;
  let security: TokenSecurity | null | undefined;

  if (pairOrOptions && typeof pairOrOptions === 'object' && 'pair' in pairOrOptions) {
    pair = pairOrOptions.pair;
    holders = pairOrOptions.holders;
    security = pairOrOptions.security;
  } else {
    pair = pairOrOptions as DexPair | null;
  }

  const flags: RiskFlag[] = [];
  let totalScore = 0;

  // ── 1. Liquidity risk (max 22 pts) ──
  const liquidity = pair?.liquidity?.usd ?? 0;
  if (liquidity < 1_000) {
    flags.push({ type: 'liquidity', severity: 'critical', message: `Dangerously low liquidity: $${liquidity.toFixed(0)} (high slippage, possible rug)` });
    totalScore += 22;
  } else if (liquidity < 5_000) {
    flags.push({ type: 'liquidity', severity: 'critical', message: `Extremely low liquidity: $${liquidity.toFixed(0)}` });
    totalScore += 18;
  } else if (liquidity < 25_000) {
    flags.push({ type: 'liquidity', severity: 'high', message: `Low liquidity: $${liquidity.toFixed(0)}` });
    totalScore += 12;
  } else if (liquidity < 100_000) {
    flags.push({ type: 'liquidity', severity: 'medium', message: `Moderate liquidity: $${liquidity.toFixed(0)}` });
    totalScore += 5;
  }

  // ── 2. Token age (max 10 pts) ──
  if (pair?.pairCreatedAt) {
    const ageMs = Date.now() - pair.pairCreatedAt;
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < 1) {
      flags.push({ type: 'age', severity: 'critical', message: `Token launched ${Math.round(ageHours * 60)}m ago` });
      totalScore += 10;
    } else if (ageHours < 6) {
      flags.push({ type: 'age', severity: 'high', message: `Token is ${Math.round(ageHours)}h old` });
      totalScore += 7;
    } else if (ageHours < 24) {
      flags.push({ type: 'age', severity: 'medium', message: `Token is ${Math.round(ageHours)}h old` });
      totalScore += 4;
    }
  }

  // ── 3. Volume anomalies (max 8 pts) ──
  const volume24h = pair?.volume?.h24 ?? 0;
  const volume1h = pair?.volume?.h1 ?? 0;
  const mcap = pair?.marketCap ?? 0;

  if (volume24h > 0 && mcap > 0) {
    const volMcapRatio = volume24h / mcap;
    if (volMcapRatio > 5) {
      flags.push({ type: 'volume_anomaly', severity: 'high', message: `Suspicious volume: ${volMcapRatio.toFixed(1)}x market cap (possible wash trading)` });
      totalScore += 8;
    } else if (volMcapRatio > 2) {
      flags.push({ type: 'volume_anomaly', severity: 'medium', message: `High volume relative to mcap: ${volMcapRatio.toFixed(1)}x` });
      totalScore += 3;
    }
  }
  if (volume24h === 0 && volume1h === 0) {
    flags.push({ type: 'no_volume', severity: 'medium', message: 'Zero trading volume, token may be dead' });
    totalScore += 5;
  }

  // ── Holder-based risks (only if we have GMGN data) ──
  if (holders && holders.length > 0) {
    // ── 4. Top holder concentration (max 18 pts) ──
    const sorted = [...holders].sort((a, b) => b.supplyPercent - a.supplyPercent);
    const top10Pct = sorted.slice(0, 10).reduce((s, h) => s + h.supplyPercent, 0);

    if (top10Pct > 0.60) {
      flags.push({ type: 'concentration', severity: 'critical', message: `Top 10 holders own ${(top10Pct * 100).toFixed(1)}%` });
      totalScore += 18;
    } else if (top10Pct > 0.40) {
      flags.push({ type: 'concentration', severity: 'high', message: `Top 10 holders own ${(top10Pct * 100).toFixed(1)}%` });
      totalScore += 10;
    } else if (top10Pct > 0.25) {
      flags.push({ type: 'concentration', severity: 'medium', message: `Top 10 holders own ${(top10Pct * 100).toFixed(1)}%` });
      totalScore += 4;
    }

    // ── 5. Dev wallet (max 15 pts) ──
    const dev = holders.find(h => h.isDeployer);
    if (dev) {
      if (dev.supplyPercent > 0.20) {
        flags.push({ type: 'dev_wallet', severity: 'critical', message: `Dev holds ${(dev.supplyPercent * 100).toFixed(1)}% (rug risk)` });
        totalScore += 15;
      } else if (dev.supplyPercent > 0.10) {
        flags.push({ type: 'dev_wallet', severity: 'high', message: `Dev holds ${(dev.supplyPercent * 100).toFixed(1)}%` });
        totalScore += 10;
      } else if (dev.supplyPercent > 0.05) {
        flags.push({ type: 'dev_wallet', severity: 'medium', message: `Dev holds ${(dev.supplyPercent * 100).toFixed(1)}%` });
        totalScore += 5;
      }

      if (dev.sellAmount > dev.buyAmount * 0.5 && dev.sellAmount > 0) {
        flags.push({ type: 'dev_selling', severity: 'high', message: 'Dev has been selling significantly' });
        totalScore += 5;
      }
    }

    // ── 6. Fresh wallets (max 12 pts) ──
    const freshCount = holders.filter(h => h.isFreshWallet).length;
    const freshPct = freshCount / holders.length;
    if (freshPct > 0.40) {
      flags.push({ type: 'fresh_wallets', severity: 'critical', message: `${(freshPct * 100).toFixed(0)}% fresh wallets (likely bundled/wash)` });
      totalScore += 12;
    } else if (freshPct > 0.25) {
      flags.push({ type: 'fresh_wallets', severity: 'high', message: `${(freshPct * 100).toFixed(0)}% fresh wallets (possible bundle/wash)` });
      totalScore += 8;
    } else if (freshPct > 0.15) {
      flags.push({ type: 'fresh_wallets', severity: 'medium', message: `${(freshPct * 100).toFixed(0)}% fresh wallets` });
      totalScore += 4;
    }

    // ── 7. Sniper activity (max 10 pts) ──
    const sniperCount = holders.filter(h =>
      h.tags.some(t => /sniper|bot|sandwich/i.test(t))
    ).length;
    if (sniperCount > 5) {
      flags.push({ type: 'snipers', severity: 'high', message: `${sniperCount} sniper/bot wallets detected` });
      totalScore += 10;
    } else if (sniperCount > 2) {
      flags.push({ type: 'snipers', severity: 'medium', message: `${sniperCount} sniper wallets detected` });
      totalScore += 4;
    }
  } else {
    // No holder data — add uncertainty penalty
    totalScore += 12;
    flags.push({ type: 'no_holder_data', severity: 'medium', message: 'Holder analysis unavailable (limited risk assessment)' });
  }

  // ── 8. Contract security (max 5 pts) ──
  if (security) {
    if (security.mintAuthority === 'active') {
      flags.push({ type: 'mint_authority', severity: 'high', message: 'Mint authority active (dev can print tokens)' });
      totalScore += 3;
    }
    if (security.freezeAuthority === 'active') {
      flags.push({ type: 'freeze_authority', severity: 'high', message: 'Freeze authority active (dev can freeze wallets)' });
      totalScore += 2;
    }
  }

  // Clamp to 0-100
  totalScore = Math.min(100, Math.max(0, totalScore));

  const level: RiskAssessment['level'] =
    totalScore >= 70 ? 'CRITICAL' :
    totalScore >= 45 ? 'HIGH' :
    totalScore >= 20 ? 'MEDIUM' : 'LOW';

  // Build smart summary
  const summary = buildRiskSummary(level, flags, totalScore);

  return { score: totalScore, level, flags, summary };
}

/** Build a concise, actionable risk summary from flags */
function buildRiskSummary(level: RiskAssessment['level'], flags: RiskFlag[], score: number): string {
  const parts: string[] = [];

  // Headline
  switch (level) {
    case 'CRITICAL':
      parts.push(`Extreme risk (${score}/100)`);
      break;
    case 'HIGH':
      parts.push(`High risk (${score}/100)`);
      break;
    case 'MEDIUM':
      parts.push(`Moderate risk (${score}/100)`);
      break;
    case 'LOW':
      parts.push(`Lower risk (${score}/100)`);
      break;
  }

  // Top 3 most severe flags as supporting details
  const criticalFlags = flags.filter(f => f.severity === 'critical');
  const highFlags = flags.filter(f => f.severity === 'high');
  const topFlags = [...criticalFlags, ...highFlags].slice(0, 3);

  if (topFlags.length > 0) {
    parts.push(topFlags.map(f => f.message).join('; '));
  } else if (flags.length > 0) {
    parts.push(flags.slice(0, 2).map(f => f.message).join('; '));
  }

  return parts.join('. ') + '.';
}
