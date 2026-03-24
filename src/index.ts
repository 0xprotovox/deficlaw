#!/usr/bin/env node
/**
 * defi-mcp — DeFi MCP Server for Claude Code
 * First open-source DeFi MCP. Token analysis, prices, trending, holder intelligence.
 * by @0xprotovox
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
