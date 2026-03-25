/**
 * DeFi MCP Server — deficlaw
 * First open-source DeFi MCP for Claude Code.
 * Token analysis, prices, trending, top traders.
 * by @0xprotovox
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { handleAnalyzeToken } from './tools/analyzeToken.js';
import { handleGetPrice } from './tools/getPrice.js';
import { handleGetTrending } from './tools/getTrending.js';
import { handleGetTopTraders } from './tools/getTopTraders.js';
import { handleSearchToken } from './tools/searchToken.js';
import { handleGetNewLaunches } from './tools/getNewLaunches.js';
import { handleEstimateSlippage } from './tools/estimateSlippage.js';
import { handleCompareTokens } from './tools/compareTokens.js';
import { handleGetTokenSecurity } from './tools/getTokenSecurity.js';
import { formatAnalysis } from './analysis/formatOutput.js';

/** Build a compact response with only essential fields (3x smaller) */
function buildCompactResult(result: Record<string, unknown>): Record<string, unknown> {
  const compact: Record<string, unknown> = {};

  // Summary text
  if (result.summary) compact.summary = result.summary;

  // Price (just USD + 24h change)
  const price = result.price as Record<string, unknown> | undefined;
  if (price) {
    compact.price = {
      usd: price.usd,
      change24h: price.change24h,
      change1h: price.change1h,
    };
  }

  // Token basics
  const token = result.token as Record<string, unknown> | undefined;
  if (token) {
    compact.token = {
      symbol: token.symbol,
      name: token.name,
      address: token.address,
      age: token.age,
    };
  }

  // Risk score + level only
  const risk = result.risk as Record<string, unknown> | undefined;
  if (risk) {
    compact.risk = {
      score: risk.score,
      level: risk.level,
      summary: risk.summary,
    };
  }

  // Top 5 holders only (not 20)
  const holders = result.holders as Record<string, unknown> | undefined;
  if (holders) {
    const topHolders = holders.topHolders as unknown[] | undefined;
    compact.holders = {
      total: holders.total,
      top5Pct: (holders.concentration as Record<string, unknown>)?.top5Pct,
      topHolders: topHolders ? topHolders.slice(0, 5) : [],
    };
  }

  // Market basics
  const market = result.market as Record<string, unknown> | undefined;
  if (market) {
    compact.market = {
      marketCap: market.marketCap,
      liquidity: market.liquidity,
      volume24h: market.volume24h,
    };
  }

  // Meta
  compact.meta = result.meta;

  return compact;
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'deficlaw',
    version: '0.4.0',
  });

  // ── analyze_token ──
  server.tool(
    'analyze_token',
    'Full token analysis: price, volume, liquidity, holder intelligence, risk scoring. Supports Solana tokens with GMGN holder data. Use quick=true for fast price-only analysis (<1s). Use compact=true for smaller response (top 5 holders, no full details).',
    {
      address: z.string().min(1).describe('Token contract address (e.g. Solana mint address)'),
      chain: z.string().default('solana').describe('Blockchain: solana, ethereum, bsc, base, arbitrum'),
      include_holders: z.boolean().default(true).describe('Include GMGN holder analysis (slower, needs curl or Playwright)'),
      quick: z.boolean().default(false).describe('Quick mode: skip holders, return price/market/risk only (<1s)'),
      compact: z.boolean().default(false).describe('Compact mode: return summary, price, risk score, top 5 holders, verdict only (3x smaller response)'),
    },
    async (args) => {
      try {
        // Quick mode overrides include_holders
        const effectiveArgs = args.quick
          ? { ...args, include_holders: false }
          : args;
        const result = await handleAnalyzeToken(effectiveArgs);
        if ('error' in result && typeof result.error === 'string') {
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: true };
        }

        // Compact mode: return only essential fields
        if (args.compact) {
          const compact = buildCompactResult(result);
          return { content: [{ type: 'text' as const, text: JSON.stringify(compact, null, 2) }] };
        }

        const formatted = formatAnalysis(result as unknown as Parameters<typeof formatAnalysis>[0]);
        return { content: [{ type: 'text' as const, text: formatted }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Analysis failed: ${message}` }) }], isError: true };
      }
    }
  );

  // ── get_price ──
  server.tool(
    'get_price',
    'Quick token price lookup with 24h change, volume, liquidity, and market cap.',
    {
      token: z.string().min(1).describe('Token address or search query (symbol/name)'),
      chain: z.string().default('solana').describe('Blockchain: solana, ethereum, bsc, base, arbitrum'),
    },
    async (args) => {
      try {
        const result = await handleGetPrice(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          ...('error' in result ? { isError: true } : {}),
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Price lookup failed: ${message}` }) }], isError: true };
      }
    }
  );

  // ── get_trending ──
  server.tool(
    'get_trending',
    'Get trending/boosted tokens on a blockchain. Returns top tokens by volume and boost activity.',
    {
      chain: z.string().default('solana').describe('Blockchain: solana, ethereum, bsc, base, arbitrum'),
      limit: z.number().min(1).max(50).default(20).describe('Number of tokens to return (1-50)'),
    },
    async (args) => {
      try {
        const result = await handleGetTrending(args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Trending fetch failed: ${message}` }) }], isError: true };
      }
    }
  );

  // ── get_top_traders ──
  server.tool(
    'get_top_traders',
    'Find who made and lost money on a token. Shows top winners and losers with PnL, tags, and Twitter handles.',
    {
      address: z.string().min(1).describe('Token contract address'),
      limit: z.number().min(1).max(50).default(10).describe('Number of top winners/losers to show (1-50)'),
    },
    async (args) => {
      try {
        const result = await handleGetTopTraders(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          ...('error' in result ? { isError: true } : {}),
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Top traders fetch failed: ${message}` }) }], isError: true };
      }
    }
  );

  // ── search_token ──
  server.tool(
    'search_token',
    'Search for tokens by name or symbol. Returns top matches with address, price, chain, volume, and liquidity.',
    {
      query: z.string().min(1).describe('Token name or symbol to search for (e.g. "BONK", "Jupiter")'),
      chain: z.string().optional().describe('Filter by blockchain: solana, ethereum, bsc, base, arbitrum. Omit for all chains.'),
      limit: z.number().min(1).max(20).default(10).describe('Number of results to return (1-20)'),
    },
    async (args) => {
      try {
        const result = await handleSearchToken(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          ...('error' in result ? { isError: true } : {}),
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Token search failed: ${message}` }) }], isError: true };
      }
    }
  );

  // ── get_new_launches ──
  server.tool(
    'get_new_launches',
    'Get recently created tokens on a blockchain. Shows name, symbol, address, age, market cap, liquidity, and volume.',
    {
      chain: z.string().default('solana').describe('Blockchain: solana, ethereum, bsc, base, arbitrum'),
      max_age_minutes: z.number().min(5).max(1440).default(60).describe('Maximum token age in minutes (5-1440)'),
      limit: z.number().min(1).max(50).default(20).describe('Number of tokens to return (1-50)'),
    },
    async (args) => {
      try {
        const result = await handleGetNewLaunches(args);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          ...('error' in result ? { isError: true } : {}),
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `New launches fetch failed: ${message}` }) }], isError: true };
      }
    }
  );

  // ── estimate_slippage ──
  server.tool(
    'estimate_slippage',
    'Estimate buy slippage for a Solana token at $50, $100, $500, $1000. Uses Jupiter quotes.',
    {
      address: z.string().min(1).describe('Solana token mint address'),
    },
    async (args) => {
      try {
        const result = await handleEstimateSlippage(args);
        if ('error' in result) return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: true };
        return { content: [{ type: 'text' as const, text: result.summary }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Slippage estimation failed: ${message}` }) }], isError: true };
      }
    }
  );

  // ── compare_tokens ──
  server.tool(
    'compare_tokens',
    'Compare two tokens side by side: price, mcap, volume, liquidity, age, holders.',
    {
      address_a: z.string().min(1).describe('First token address'),
      address_b: z.string().min(1).describe('Second token address'),
      chain: z.string().default('solana').describe('Blockchain'),
    },
    async (args) => {
      try {
        const result = await handleCompareTokens(args);
        if ('error' in result) return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: true };
        return { content: [{ type: 'text' as const, text: result.summary }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Comparison failed: ${message}` }) }], isError: true };
      }
    }
  );

  // ── get_token_security ──
  server.tool(
    'get_token_security',
    'Quick security check: mint authority, freeze authority, supply. Solana only. "Is this token safe?"',
    {
      address: z.string().min(1).describe('Solana token mint address'),
    },
    async (args) => {
      try {
        const result = await handleGetTokenSecurity(args);
        if ('error' in result) return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: true };
        return { content: [{ type: 'text' as const, text: result.summary }] };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Security check failed: ${message}` }) }], isError: true };
      }
    }
  );

  return server;
}
