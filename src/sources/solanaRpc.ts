/**
 * Solana RPC — Token security checks (FREE, no auth)
 * Checks mint authority, freeze authority, supply
 */

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function rpcCall(method: string, params: any[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export interface TokenSecurity {
  mintAuthority: 'revoked' | 'active';
  freezeAuthority: 'revoked' | 'active';
  supply: number;
  decimals: number;
}

/** Check token mint/freeze authority */
export async function getTokenSecurity(mintAddress: string): Promise<TokenSecurity | null> {
  try {
    const result = await rpcCall('getAccountInfo', [
      mintAddress,
      { encoding: 'jsonParsed' },
    ]);

    if (!result?.value?.data?.parsed?.info) return null;

    const info = result.value.data.parsed.info;
    return {
      mintAuthority: info.mintAuthority ? 'active' : 'revoked',
      freezeAuthority: info.freezeAuthority ? 'active' : 'revoked',
      supply: parseFloat(info.supply) / Math.pow(10, info.decimals),
      decimals: info.decimals,
    };
  } catch {
    return null;
  }
}

/** Check if an address is likely an LP pool (has program owner like Raydium/Orca) */
export async function isLikelyLpPool(address: string): Promise<boolean> {
  try {
    const result = await rpcCall('getAccountInfo', [address, { encoding: 'base64' }]);
    if (!result?.value) return false;

    const owner = result.value.owner;
    const LP_PROGRAMS = [
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
      'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
      'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca Whirlpool
      'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',  // Meteora DLMM
      '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // PumpFun
      'PSwapMdSai8tjrEXcxFeQth87xC4rRsa4VA5mhGhXkP',  // PumpSwap
    ];
    return LP_PROGRAMS.includes(owner);
  } catch {
    return false;
  }
}
