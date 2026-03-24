/**
 * Composite Risk Scorer
 * Combines DexScreener + GMGN data into a 0-100 risk score
 */
import type { DexPair, Holder, RiskAssessment, RiskFlag } from '../types/index.js';

export function scoreRisk(pair: DexPair | null, holders?: Holder[]): RiskAssessment {
  const flags: RiskFlag[] = [];
  let totalScore = 0;

  // 1. Liquidity risk (25% weight)
  const liquidity = pair?.liquidity?.usd || 0;
  if (liquidity < 5000) {
    flags.push({ type: 'liquidity', severity: 'critical', message: `Extremely low liquidity: $${liquidity.toFixed(0)}` });
    totalScore += 25;
  } else if (liquidity < 25000) {
    flags.push({ type: 'liquidity', severity: 'high', message: `Low liquidity: $${liquidity.toFixed(0)}` });
    totalScore += 18;
  } else if (liquidity < 100000) {
    flags.push({ type: 'liquidity', severity: 'medium', message: `Moderate liquidity: $${liquidity.toFixed(0)}` });
    totalScore += 8;
  }

  // 2. Token age (10% weight)
  if (pair?.pairCreatedAt) {
    const ageMs = Date.now() - pair.pairCreatedAt;
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < 1) {
      flags.push({ type: 'age', severity: 'critical', message: `Token launched ${Math.round(ageHours * 60)}m ago` });
      totalScore += 10;
    } else if (ageHours < 24) {
      flags.push({ type: 'age', severity: 'high', message: `Token is ${Math.round(ageHours)}h old` });
      totalScore += 6;
    }
  }

  // Holder-based risks (only if we have GMGN data)
  if (holders && holders.length > 0) {
    // 3. Top holder concentration (20% weight)
    const sorted = [...holders].sort((a, b) => b.supplyPercent - a.supplyPercent);
    const top10Pct = sorted.slice(0, 10).reduce((s, h) => s + h.supplyPercent, 0);
    if (top10Pct > 60) {
      flags.push({ type: 'concentration', severity: 'critical', message: `Top 10 holders own ${(top10Pct * 100).toFixed(1)}%` });
      totalScore += 20;
    } else if (top10Pct > 40) {
      flags.push({ type: 'concentration', severity: 'high', message: `Top 10 holders own ${(top10Pct * 100).toFixed(1)}%` });
      totalScore += 12;
    } else if (top10Pct > 25) {
      flags.push({ type: 'concentration', severity: 'medium', message: `Top 10 holders own ${(top10Pct * 100).toFixed(1)}%` });
      totalScore += 5;
    }

    // 4. Dev wallet (20% weight)
    const dev = holders.find(h => h.isDeployer);
    if (dev) {
      if (dev.supplyPercent > 0.10) {
        flags.push({ type: 'dev_wallet', severity: 'high', message: `Dev holds ${(dev.supplyPercent * 100).toFixed(1)}%` });
        totalScore += 15;
      } else if (dev.sellAmount > dev.buyAmount * 0.5) {
        flags.push({ type: 'dev_selling', severity: 'medium', message: 'Dev has been selling' });
        totalScore += 8;
      }
    }

    // 5. Fresh wallets (15% weight)
    const freshCount = holders.filter(h => h.isFreshWallet).length;
    const freshPct = freshCount / holders.length;
    if (freshPct > 0.30) {
      flags.push({ type: 'fresh_wallets', severity: 'high', message: `${(freshPct * 100).toFixed(0)}% fresh wallets (possible bundle/wash)` });
      totalScore += 15;
    } else if (freshPct > 0.15) {
      flags.push({ type: 'fresh_wallets', severity: 'medium', message: `${(freshPct * 100).toFixed(0)}% fresh wallets` });
      totalScore += 7;
    }

    // 6. Sniper activity (10% weight)
    const sniperCount = holders.filter(h =>
      h.tags.some(t => t.toLowerCase().includes('sniper') || t.toLowerCase().includes('bot'))
    ).length;
    if (sniperCount > 5) {
      flags.push({ type: 'snipers', severity: 'high', message: `${sniperCount} sniper/bot wallets detected` });
      totalScore += 10;
    } else if (sniperCount > 2) {
      flags.push({ type: 'snipers', severity: 'medium', message: `${sniperCount} sniper wallets detected` });
      totalScore += 4;
    }
  } else {
    // No holder data — add uncertainty
    totalScore += 15;
    flags.push({ type: 'no_holder_data', severity: 'medium', message: 'Holder analysis unavailable (install Playwright for full analysis)' });
  }

  // Clamp to 0-100
  totalScore = Math.min(100, Math.max(0, totalScore));

  const level = totalScore >= 70 ? 'CRITICAL' : totalScore >= 45 ? 'HIGH' : totalScore >= 20 ? 'MEDIUM' : 'LOW';

  const summaryParts: string[] = [];
  if (level === 'CRITICAL') summaryParts.push('Extreme risk');
  else if (level === 'HIGH') summaryParts.push('High risk');
  else if (level === 'MEDIUM') summaryParts.push('Moderate risk');
  else summaryParts.push('Lower risk');

  if (flags.length > 0) {
    summaryParts.push(flags.slice(0, 3).map(f => f.message).join('; '));
  }

  return { score: totalScore, level, flags, summary: summaryParts.join('. ') + '.' };
}
