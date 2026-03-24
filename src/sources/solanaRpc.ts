/**
 * Solana RPC — Token security checks (FREE, no auth needed).
 * Checks mint authority, freeze authority, supply via getAccountInfo.
 */

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

interface RpcResponse {
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

/** Make a JSON-RPC call to the Solana cluster with timeout */
async function rpcCall(method: string, params: unknown[]): Promise<Record<string, unknown> | null> {
  let res: Response;
  try {
    res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Solana RPC request failed (${method}): ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`Solana RPC HTTP ${res.status}: ${res.statusText}`);
  }

  let json: RpcResponse;
  try {
    json = await res.json() as RpcResponse;
  } catch {
    throw new Error(`Solana RPC returned invalid JSON for ${method}`);
  }

  if (json.error) {
    throw new Error(`Solana RPC error (${json.error.code}): ${json.error.message}`);
  }

  return json.result ?? null;
}

export interface TokenSecurity {
  mintAuthority: 'revoked' | 'active';
  freezeAuthority: 'revoked' | 'active';
  supply: number;
  decimals: number;
}

/** Check token mint/freeze authority. Returns null if account not found or not a token mint. */
export async function getTokenSecurity(mintAddress: string): Promise<TokenSecurity | null> {
  if (!mintAddress || mintAddress.trim().length === 0) return null;

  try {
    const result = await rpcCall('getAccountInfo', [
      mintAddress,
      { encoding: 'jsonParsed' },
    ]);

    // Navigate the nested structure safely
    const value = result?.value as Record<string, unknown> | undefined;
    const data = value?.data as Record<string, unknown> | undefined;
    const parsed = data?.parsed as Record<string, unknown> | undefined;
    const info = parsed?.info as Record<string, unknown> | undefined;

    if (!info) return null;

    const decimals = typeof info.decimals === 'number' ? info.decimals : 0;
    const supplyStr = typeof info.supply === 'string' ? info.supply : '0';

    return {
      mintAuthority: info.mintAuthority ? 'active' : 'revoked',
      freezeAuthority: info.freezeAuthority ? 'active' : 'revoked',
      supply: parseFloat(supplyStr) / Math.pow(10, decimals),
      decimals,
    };
  } catch {
    // Security check is non-critical; return null on failure
    return null;
  }
}

/** Known LP/AMM program IDs on Solana */
const LP_PROGRAMS = new Set([
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',  // Orca Whirlpool
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',  // Meteora DLMM
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',  // PumpFun
  'PSwapMdSai8tjrEXcxFeQth87xC4rRsa4VA5mhGhXkP',  // PumpSwap
]);

/** Check if an address is likely an LP pool (owned by a known AMM program) */
export async function isLikelyLpPool(address: string): Promise<boolean> {
  if (!address || address.trim().length === 0) return false;

  try {
    const result = await rpcCall('getAccountInfo', [address, { encoding: 'base64' }]);
    const value = result?.value as Record<string, unknown> | undefined;
    if (!value) return false;

    const owner = value.owner;
    return typeof owner === 'string' && LP_PROGRAMS.has(owner);
  } catch {
    return false;
  }
}
