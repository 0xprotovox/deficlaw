[![npm version](https://img.shields.io/npm/v/@0xprotovox/deficlaw.svg)](https://www.npmjs.com/package/@0xprotovox/deficlaw)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple.svg)](https://modelcontextprotocol.io)

# deficlaw

**The first open-source DeFi MCP server for Claude Code.**

Analyze any token in seconds. Holder intelligence, risk scoring, smart money tracking, KOL detection, slippage estimation, contract security. Zero API keys required.

```
> "analyze Jupiter token"

JUP is a 2.2y old Meteora token with $1.2M liquidity and $525.1M market cap.
Top 5 wallets control 61.5% of supply, very concentrated.
30 diamond hands among holders, decent conviction.
Contract looks safe: mint and freeze authorities revoked.
10 KOLs tracked: 5 holding, 5 selling.

Risk: 18/100 [LOW]
VERDICT: NEUTRAL — Mixed signals: 2 bull vs 2 bear.
Sources: dexscreener + gmgn + solana-rpc | 1.1s
```

## Why deficlaw?

Claude Code can write code, fix bugs, deploy apps. But ask it "what's the price of BONK?" and it says *"I don't have real-time data."*

**deficlaw fixes that.** 9 tools, 3 data sources, zero config.

| Feature | Details |
|---------|---------|
| **Token Analysis** | Holder intelligence, risk scoring, KOL tracking, actionable verdicts |
| **Real-time Prices** | Sub-second lookups across Solana, Ethereum, Base, BSC, Arbitrum |
| **Trending Tokens** | Volume, liquidity, and boost data from DexScreener |
| **New Launches** | Recently created tokens with age, mcap, liquidity |
| **Top Traders** | Who made and lost money on any token with PnL breakdown |
| **Token Search** | Find any token by name or symbol across all chains |
| **Slippage Estimation** | Jupiter-based price impact for $50-$1000 buys |
| **Token Comparison** | Side-by-side analysis of two tokens |
| **Contract Security** | Mint/freeze authority, supply checks on Solana |

## Install

```bash
npm install -g @0xprotovox/deficlaw
claude mcp add defi -- deficlaw
```

That's it. No API keys, no config files, no accounts needed.

<details>
<summary>Install from source</summary>

```bash
git clone https://github.com/0xprotovox/deficlaw.git
cd deficlaw && npm install && npm run build
claude mcp add defi -- node /path/to/deficlaw/dist/index.js
```
</details>

## Quick Start

Once installed, just type naturally in Claude Code:

### Prices (fastest, ~50ms cached / ~300ms first call)
```
> what's the price of BONK?
> price of JUP
> how much is SOL right now?
```

### Full Analysis (~1.1s with holders + risk + verdict)
```
> analyze token JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN
> deep analyze BONK
> is this token safe? EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

### Quick Scan (~350ms, price + risk only, no holders)
```
> quick analyze So11111...
> give me a quick look at this token
```

### Search, Trending, New Launches
```
> search for BONK
> what's trending on solana?
> show new launches on solana in the last 30 minutes
```

### Top Traders & Comparison
```
> who profited on this token?
> compare JUP vs BONK
```

### Slippage & Security
```
> estimate slippage for buying this token
> is this token contract safe?
```

## Tools Reference

### `analyze_token`

Full token analysis with holder intelligence, risk scoring, and human-readable summary.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `address` | string | *required* | Token contract address |
| `chain` | string | `"solana"` | Blockchain (solana, ethereum, bsc, base, arbitrum) |
| `include_holders` | boolean | `true` | Include GMGN holder analysis |
| `quick` | boolean | `false` | Quick mode: skip holders, price/market/risk only (<1s) |
| `compact` | boolean | `false` | Compact response: summary, price, risk, top 5 holders only |

**Returns:** Token info, price (5m/1h/6h/24h), market data (mcap, fdv, volume, liquidity), contract security, risk score (0-100), holder concentration, holder categories (diamond hands, snipers, KOLs, fresh wallets, insiders, smart money), buy/sell pressure, dev wallet status, top 20 holders with PnL, KOL list, socials, actionable verdict (BUY/SELL/NEUTRAL/AVOID).

### `get_price`

Sub-second price lookup. Accepts both addresses and name/symbol searches.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `token` | string | *required* | Token address or search query |
| `chain` | string | `"solana"` | Blockchain |

### `search_token`

Search tokens by name or symbol across all chains.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | *required* | Token name or symbol (e.g. "BONK", "Jupiter") |
| `chain` | string | all | Filter by chain |
| `limit` | number | `10` | Results to return (1-20) |

### `get_trending`

Trending and boosted tokens with price enrichment.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `chain` | string | `"solana"` | Blockchain |
| `limit` | number | `20` | Number of tokens (1-50) |

### `get_new_launches`

Recently created tokens sorted by creation time.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `chain` | string | `"solana"` | Blockchain |
| `max_age_minutes` | number | `60` | Max token age in minutes (5-1440) |
| `limit` | number | `20` | Tokens to return (1-50) |

### `get_top_traders`

Who made and lost money on a token. Shows winners and losers with PnL, tags, and Twitter handles.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `address` | string | *required* | Token contract address |
| `limit` | number | `10` | Number of top winners/losers (1-50) |

### `estimate_slippage`

Jupiter-based price impact estimation for $50, $100, $500, $1000 buys. Solana only.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `address` | string | *required* | Solana token mint address |

### `compare_tokens`

Side-by-side comparison of two tokens: price, mcap, volume, liquidity, age, holders.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `address_a` | string | *required* | First token address |
| `address_b` | string | *required* | Second token address |
| `chain` | string | `"solana"` | Blockchain |

### `get_token_security`

Quick contract security check. Solana only.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `address` | string | *required* | Solana token mint address |

**Returns:** Mint authority status, freeze authority status, total supply, decimals, and a SAFE/CAUTION/DANGEROUS verdict.

## Architecture

```
Claude Code
    |
    | MCP stdio
    v
+------------------+
|    deficlaw       |
|    MCP Server     |
|                  |
|  +-- Cache ----+ |      +--------------+
|  | TTL-based   | | ---> | DexScreener  |  prices, volume,
|  | in-memory   | |      | (free API)   |  liquidity, pairs
|  +-------------+ |      +--------------+
|                  |
|  +-- Risk ----+  |      +--------------+
|  | 8-dimension | | ---> | GMGN         |  holders, KOLs,
|  | scorer      | |      | (curl/PW)    |  tags, PnL
|  +-------------+ |      +--------------+
|                  |
|  +-- Summary --+ |      +--------------+
|  | Rule-based  | | ---> | Solana RPC   |  mint/freeze auth,
|  | generator   | |      | (free)       |  supply, LP detect
|  +-------------+ |      +--------------+
|                  |
|  +-- Jupiter --+ |      +--------------+
|  | Quote API   | | ---> | Jupiter      |  slippage quotes,
|  | client      | |      | (free API)   |  route planning
|  +-------------+ |      +--------------+
+------------------+
```

**Key design decisions:**
- **curl-based GMGN fetcher** bypasses Cloudflare TLS fingerprinting (Playwright fallback if curl is blocked)
- **TTL-based in-memory cache** with automatic cleanup prevents rate limiting and keeps responses fast
- **Rate limiter** with exponential backoff and retry logic for DexScreener (200ms min interval)
- **Parallel fetching** where possible (holders + security run simultaneously)
- **All free APIs**, no keys needed

## Performance

Benchmarked on real tokens (BONK), averaged across multiple runs:

| Operation | Time | Notes |
|-----------|------|-------|
| `get_price` | ~54ms | Cached: near-instant |
| `search_token` | ~340ms | DexScreener search API |
| `analyze_token` (quick) | ~410ms | Price + market + risk, no holders |
| `analyze_token` (full) | ~1.1-1.5s | All sources: DexScreener + GMGN + Solana RPC |
| `get_token_security` | ~300ms | Single Solana RPC call |
| `estimate_slippage` | ~500ms | 4 Jupiter quotes in parallel |

## Risk Scoring

The composite risk scorer analyzes **8 dimensions** to produce a 0-100 score:

| # | Dimension | Max Points | What It Checks |
|---|-----------|-----------|----------------|
| 1 | **Liquidity** | 22 | Pool depth in USD. <$1K = critical, <$5K = extreme, <$25K = high |
| 2 | **Token Age** | 10 | Time since pair creation. <1h = critical, <6h = high, <24h = medium |
| 3 | **Volume Anomalies** | 8 | Vol/mcap ratio for wash trading signals. >5x = suspicious |
| 4 | **Holder Concentration** | 18 | Top 10 holder supply %. >60% = critical, >40% = high |
| 5 | **Dev Wallet** | 15 | Dev holdings % and selling behavior. >20% = rug risk |
| 6 | **Fresh Wallets** | 12 | New wallet % among holders. >40% = likely bundled/wash |
| 7 | **Sniper Activity** | 10 | Bot/sniper/sandwich wallets in top holders |
| 8 | **Contract Security** | 5 | Mint authority (3pts) + freeze authority (2pts) |

**Risk Levels:**

| Level | Score Range | Meaning |
|-------|------------|---------|
| LOW | 0-19 | Few concerns, safer relative to peers |
| MEDIUM | 20-44 | Some concerns, do your own research |
| HIGH | 45-69 | Multiple red flags, elevated caution |
| CRITICAL | 70-100 | Extreme risk, likely scam or rug-pull |

## Configuration

All environment variables are optional. deficlaw works out of the box with zero config.

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Custom Solana RPC endpoint (use a private RPC for better reliability) |
| `DEFICLAW_CACHE_TTL` | `120000` (2 min) | GMGN holder cache TTL in milliseconds |
| `DEFICLAW_PRICE_CACHE_TTL` | `30000` (30s) | Price cache TTL in milliseconds |
| `DEBUG` | *(unset)* | Set to `deficlaw` to enable debug logging to stderr |

### Claude Code Config

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "defi": {
      "command": "npx",
      "args": ["-y", "@0xprotovox/deficlaw"]
    }
  }
}
```

<details>
<summary>With custom environment variables</summary>

```json
{
  "mcpServers": {
    "defi": {
      "command": "npx",
      "args": ["-y", "@0xprotovox/deficlaw"],
      "env": {
        "SOLANA_RPC_URL": "https://your-rpc.com",
        "DEFICLAW_CACHE_TTL": "120000",
        "DEFICLAW_PRICE_CACHE_TTL": "30000",
        "DEBUG": "deficlaw"
      }
    }
  }
}
```
</details>

## Supported Chains

**Prices and trending** work on all DexScreener-supported chains: Solana, Ethereum, Base, BSC, Arbitrum, Polygon, Avalanche, Optimism, Fantom, and more.

**Holder analysis** (GMGN) currently supports **Solana** tokens.

**Slippage estimation** (Jupiter) supports **Solana** tokens.

## Roadmap

- [x] Token analysis with holder intelligence
- [x] Risk scoring (8 dimensions, 0-100)
- [x] Contract security checks (mint/freeze authority)
- [x] KOL detection with Twitter handles
- [x] Human-readable AI summary with actionable insights
- [x] Top traders (winners/losers with PnL)
- [x] Token search by name/symbol
- [x] New launches detection
- [x] Actionable verdict (BUY/SELL/NEUTRAL/AVOID)
- [x] Slippage estimation (Jupiter quotes)
- [x] Token comparison (side by side)
- [x] Configurable cache TTL via env vars
- [x] Debug logging (DEBUG=deficlaw)
- [x] LP pool detection in top holders
- [ ] Multi-chain holder analysis (Ethereum, Base)
- [ ] Price alerts via MCP resources
- [ ] Wallet portfolio analysis
- [ ] Historical price charts
- [ ] DEX aggregator integration for trade execution

## Contributing

Contributions welcome! Here's how:

1. Fork the repo
2. Create your branch (`git checkout -b feature/my-feature`)
3. Make changes and ensure `npx tsc --noEmit` passes with zero errors
4. Run benchmarks (`npm test`) to verify nothing regressed
5. Commit and open a PR

**Development setup:**
```bash
git clone https://github.com/0xprotovox/deficlaw.git
cd deficlaw
npm install
npm run build    # compile TypeScript
npm test         # run speed benchmarks
npm run dev      # run from source with tsx
```

## Built With

- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) - MCP server framework
- [DexScreener API](https://docs.dexscreener.com) - Price and market data
- [GMGN](https://gmgn.ai) - Holder intelligence
- [Jupiter Quote API](https://station.jup.ag/docs/apis/swap-api) - Slippage estimation
- TypeScript, Zod, Node.js 18+

## License

MIT

## Author

**@0xprotovox** - [Twitter](https://x.com/0xprotovox) | [GitHub](https://github.com/0xprotovox)

20 years building software. Now building AI trading agents and DeFi tools.
