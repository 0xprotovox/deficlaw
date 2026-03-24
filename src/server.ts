/**
 * DeFi MCP Server
 * First open-source DeFi MCP for Claude Code
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
    name: 'defi-mcp',
    version: '0.1.0',
  });

  // ── analyze_token ──
  server.tool(
    'analyze_token',
    'Full token analysis: price, volume, liquidity, holder intelligence, risk scoring. Supports Solana tokens with GMGN holder data.',
    {
      address: z.string().describe('Token contract address (e.g. Solana mint address)'),
      chain: z.string().default('solana').describe('Blockchain: solana, ethereum, bsc, base, arbitrum'),
      include_holders: z.boolean().default(true).describe('Include GMGN holder analysis (slower, needs Playwright)'),
    },
    async (args) => {
      try {
        const result = await handleAnalyzeToken(args);
        if ('error' in result) return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: true };
        const formatted = formatAnalysis(result);
        return { content: [{ type: 'text', text: formatted }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    }
  );

  // ── get_price ──
  server.tool(
    'get_price',
    'Quick token price lookup with 24h change, volume, liquidity, and market cap.',
    {
      token: z.string().describe('Token address or search query'),
      chain: z.string().default('solana').describe('Blockchain: solana, ethereum, bsc, base, arbitrum'),
    },
    async (args) => {
      try {
        const result = await handleGetPrice(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    }
  );

  // ── get_trending ──
  server.tool(
    'get_trending',
    'Get trending/boosted tokens on a blockchain. Returns top tokens by volume and boost activity.',
    {
      chain: z.string().default('solana').describe('Blockchain: solana, ethereum, bsc, base, arbitrum'),
      limit: z.number().default(20).describe('Number of tokens to return (max 50)'),
    },
    async (args) => {
      try {
        const result = await handleGetTrending(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    }
  );

  // ── get_top_traders ──
  server.tool(
    'get_top_traders',
    'Find who made and lost money on a token. Shows top winners and losers with PnL, tags, and Twitter handles.',
    {
      address: z.string().describe('Token contract address'),
      limit: z.number().default(10).describe('Number of top winners/losers to show'),
    },
    async (args) => {
      try {
        const result = await handleGetTopTraders(args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }], isError: true };
      }
    }
  );

  return server;
}
