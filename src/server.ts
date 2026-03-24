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
import { formatAnalysis } from './analysis/formatOutput.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'deficlaw',
    version: '0.2.0',
  });

  // ── analyze_token ──
  server.tool(
    'analyze_token',
    'Full token analysis: price, volume, liquidity, holder intelligence, risk scoring. Supports Solana tokens with GMGN holder data.',
    {
      address: z.string().min(1).describe('Token contract address (e.g. Solana mint address)'),
      chain: z.string().default('solana').describe('Blockchain: solana, ethereum, bsc, base, arbitrum'),
      include_holders: z.boolean().default(true).describe('Include GMGN holder analysis (slower, needs curl or Playwright)'),
    },
    async (args) => {
      try {
        const result = await handleAnalyzeToken(args);
        if ('error' in result && typeof result.error === 'string') {
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: true };
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

  return server;
}
