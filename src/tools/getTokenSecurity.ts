/**
 * get_token_security tool — Quick standalone security check.
 * Checks mint authority, freeze authority, supply, and gives a quick verdict.
 * Solana only. Uses free Solana RPC, no auth needed.
 */
import { getTokenSecurity, type TokenSecurity } from '../sources/solanaRpc.js';
import { getTokenPair } from '../sources/dexscreener.js';
import { debug } from '../utils/debug.js';

interface SecurityResult {
  token: string;
  symbol: string;
  name: string;
  security: {
    mintAuthority: 'revoked' | 'active';
    freezeAuthority: 'revoked' | 'active';
    supply: number;
    decimals: number;
  };
  verdict: 'SAFE' | 'CAUTION' | 'DANGEROUS';
  issues: string[];
  summary: string;
}

export async function handleGetTokenSecurity(args: {
  address: string;
}): Promise<SecurityResult | { error: string }> {
  if (!args.address || args.address.trim().length === 0) {
    return { error: 'Token address is required. Provide a Solana token mint address.' };
  }

  const address = args.address.trim();
  debug(`Security check for ${address}`);

  // Fetch security and token info in parallel
  const [security, pair] = await Promise.all([
    getTokenSecurity(address),
    getTokenPair(address, 'solana').catch(() => null),
  ]);

  if (!security) {
    return {
      error: `Could not fetch security data for ${address}. The address may not be a valid Solana token mint, or the RPC may be temporarily unavailable.`,
    };
  }

  const symbol = pair?.baseToken?.symbol ?? address.slice(0, 6);
  const name = pair?.baseToken?.name ?? 'Unknown';

  // Determine issues and verdict
  const issues: string[] = [];

  if (security.mintAuthority === 'active') {
    issues.push('Mint authority is ACTIVE. The deployer can print unlimited tokens, diluting holders.');
  }
  if (security.freezeAuthority === 'active') {
    issues.push('Freeze authority is ACTIVE. The deployer can freeze any wallet, preventing sells.');
  }

  let verdict: SecurityResult['verdict'];
  if (security.mintAuthority === 'active' && security.freezeAuthority === 'active') {
    verdict = 'DANGEROUS';
  } else if (security.mintAuthority === 'active' || security.freezeAuthority === 'active') {
    verdict = 'CAUTION';
  } else {
    verdict = 'SAFE';
  }

  // Build summary
  const lines: string[] = [];
  lines.push(`Security check for ${symbol} (${name}):`);
  lines.push('');
  lines.push(`  Mint Authority:   ${security.mintAuthority === 'revoked' ? 'Revoked (safe)' : 'ACTIVE (can print tokens!)'}`);
  lines.push(`  Freeze Authority: ${security.freezeAuthority === 'revoked' ? 'Revoked (safe)' : 'ACTIVE (can freeze wallets!)'}`);
  lines.push(`  Total Supply:     ${Math.round(security.supply).toLocaleString()}`);
  lines.push(`  Decimals:         ${security.decimals}`);
  lines.push('');

  if (verdict === 'SAFE') {
    lines.push('VERDICT: SAFE. Both mint and freeze authorities are revoked. The deployer cannot print tokens or freeze wallets.');
  } else if (verdict === 'CAUTION') {
    lines.push(`VERDICT: CAUTION. ${issues.join(' ')}`);
  } else {
    lines.push(`VERDICT: DANGEROUS. ${issues.join(' ')} This token has full rug-pull capabilities.`);
  }

  return {
    token: address,
    symbol,
    name,
    security,
    verdict,
    issues,
    summary: lines.join('\n'),
  };
}
