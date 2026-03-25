# deficlaw

**The first open-source DeFi MCP server for Claude Code.**

Analyze any Solana token in seconds. Holder intelligence, risk scoring, smart money tracking, KOL detection. Zero API keys required.

```
> "analyze token 3oQwNvAfZMuPWjVPC12ukY7RPA9JiGwLod6Pr4Lkpump"

=== SUMMARY ===
POKE6900 is a 9mo old PumpSwap token with $25.9K liquidity and $34.5K market cap.
53 diamond hands (53.0%), strong holder conviction.
Only 18.0% of holders are in profit, most are underwater with avg loss of $844 per wallet.
Buy pressure is strong at 3.3:1 ratio (1093 buys vs 395 sells), accumulation phase.
Contract looks safe: mint and freeze authorities revoked.
Lower risk profile based on available data.
```

## Why deficlaw?

Claude Code can write code, fix bugs, deploy apps. But ask it "what's the price of BONK?" and it says *"I don't have real-time data."*

**deficlaw fixes that.** It gives Claude Code real-time access to DeFi data across Solana and 10+ chains.

- **Token Analysis** with holder intelligence, risk scoring, KOL tracking
- **Token Search** by name or symbol across all chains
- **New Launches** detection with age, mcap, liquidity data
- **Real-time Prices** from DexScreener across all major chains
- **Trending Tokens** with volume, liquidity, and boost data
- **Top Traders** showing who made and lost money on any token
- **Contract Security** checking mint/freeze authority on Solana
- **Actionable Verdicts** (BUY/SELL/NEUTRAL/AVOID) based on combined data signals
- **~1.5 second** full analysis (not 11 seconds like browser-based scrapers)
- **Zero config** - no API keys, no wallets, no accounts needed

## Install

### Option A: npm (recommended)

```bash
npm install -g @0xprotovox/deficlaw
claude mcp add defi -- deficlaw
```

### Option B: From source

```bash
git clone https://github.com/0xprotovox/deficlaw.git
cd deficlaw
npm install && npm run build
claude mcp add defi -- node /path/to/deficlaw/dist/index.js
```

That's it. No API keys, no config files, no accounts needed.

## Quick Start Guide

Once installed, open Claude Code and try these commands. Just type naturally:

### Check a token price (fastest, ~300ms)
```
> what's the price of BONK?
> price of JUP
> how much is SOL right now?
```

### Quick token scan (~350ms, no holder data)
```
> quick analyze So11111...
> give me a quick look at this token: 3oQw...pump
```

### Full deep analysis (~1.5s, with holders + risk + verdict)
```
> analyze token 3oQwNvAfZMuPWjVPC12ukY7RPA9JiGwLod6Pr4Lkpump
> deep analyze JUP token
> is this token safe? EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

### Compact analysis (small response, top 5 holders only)
```
> compact analyze 3oQw...pump
> give me a brief analysis of BONK
```

### Search tokens by name
```
> search for BONK
> find tokens named "dog"
> search Jupiter token
```

### Trending tokens
```
> what's trending on solana?
> show me trending tokens on ethereum
> top tokens on base right now
```

### New launches
```
> show new launches on solana in the last 30 minutes
> any new tokens launched in the last hour?
```

### Who made money?
```
> who profited on this token: 3oQw...pump?
> show me top traders on JUP
> who lost money on BONK?
```

### Pro tips
- Use **quick mode** for fast scans when you just need price + risk
- Use **compact mode** when you want holder data but don't need the full 20-holder table
- **Paste any Solana token address** and ask "is this safe?" for instant security + risk check
- Chain commands: "analyze this token and tell me if I should buy it"
- Works with **any chain** for prices: solana, ethereum, base, bsc, arbitrum

## Tools

### `analyze_token`

Full token analysis with holder intelligence, risk scoring, and human-readable summary.

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `address` | string | required | Token contract address |
| `chain` | string | `"solana"` | Blockchain (solana, ethereum, bsc, base, arbitrum) |
| `include_holders` | boolean | `true` | Include GMGN holder analysis |

**Output includes:**
- Token info (name, symbol, age, socials)
- Price with 5m/1h/6h/24h changes
- Market data (mcap, fdv, volume, liquidity, vol/liq ratio)
- Contract security (mint authority, freeze authority, supply)
- Risk score (0-100) with detailed flags
- Holder concentration (top 5/10/20)
- Holder categories (diamond hands, snipers, KOLs, fresh wallets, insiders)
- Buy/sell pressure ratio
- Sentiment (profitable vs underwater holders, avg PnL)
- Dev wallet detection and status
- Top 20 holders table with PnL and tags
- KOL list with Twitter handles
- Human-readable summary with actionable insights

### `search_token`

Search for tokens by name or symbol. Returns top matches across all chains.

```
> "search for BONK"

Results:
1. Bonk (BONK) -- solana -- $0.000024 -- $1.8B mcap
2. BonkBot (BONK) -- ethereum -- $0.00001 -- $2M mcap
```

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Token name or symbol |
| `chain` | string | all | Filter by chain |
| `limit` | number | `10` | Results to return (1-20) |

### `get_new_launches`

Get recently created tokens on a blockchain, sorted by creation time.

```
> "new launches on solana last 30 minutes"

1. NEWTOKEN -- 12m old -- $0.001 -- $50K mcap -- $15K liq
2. LAUNCH2 -- 25m old -- $0.0005 -- $20K mcap -- $8K liq
```

**Input:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `chain` | string | `"solana"` | Blockchain |
| `max_age_minutes` | number | `60` | Max token age in minutes (5-1440) |
| `limit` | number | `20` | Tokens to return (1-50) |

### `get_price`

Quick price lookup. Sub-second response. Supports both token addresses and name/symbol search.

```
> "price of So11111112222..."

BONK -- $0.000024 (+5.2% 24h)
Volume: $142M | Liquidity: $12M | MCap: $1.8B
```

### `get_trending`

Trending and boosted tokens on any chain.

```
> "trending tokens on solana"

1. BONK -- $0.000024 (+12%) -- $142M volume
2. WIF  -- $0.89 (-2.1%)   -- $89M volume
3. JUP  -- $0.94 (+3.5%)   -- $45M volume
...
```

### `get_top_traders`

Who made and lost money on a token. Winners, losers, PnL, tags.

```
> "who profited on this token?"

Top Winners:
1. CR5N... -- +$680 (+124%) still holding
2. EsRB... -- +$166 (+16%) diamond hands

Top Losers:
1. BgeeV... -- -$7,548 (-65%) diamond hands (!)
2. 5vqid... -- -$5,420 (-50%) gmgn user
```

## Data Sources

All free, no API keys required:

| Source | Data | Speed |
|--------|------|-------|
| **DexScreener** | Prices, volume, liquidity, pairs, trending | <0.5s |
| **GMGN** | Holders, tags, KOLs, PnL, dev wallet, snipers | ~1s |
| **Solana RPC** | Mint authority, freeze authority, supply | <0.5s |

**Total analysis time: ~1.5 seconds**

## Supported Chains

Prices and trending work on all DexScreener chains:

Solana, Ethereum, Base, BSC, Arbitrum, Polygon, Avalanche, Optimism, Fantom, and more.

Holder analysis (GMGN) currently supports **Solana** tokens.

## Risk Scoring

The risk scorer analyzes 8 dimensions to produce a 0-100 score:

| Dimension | Max Points | What it checks |
|-----------|-----------|----------------|
| Liquidity | 22 | Pool depth in USD |
| Token Age | 10 | Time since creation |
| Volume Anomalies | 8 | Wash trading signals, vol/mcap ratio |
| Holder Concentration | 18 | Top 10 holder % |
| Dev Wallet | 15 | Dev holdings and selling behavior |
| Fresh Wallets | 12 | New wallet % (possible wash/bundle) |
| Sniper Activity | 10 | Bot/sniper wallets in top holders |
| Contract Security | 5 | Mint/freeze authority status |

**Levels:** LOW (0-19) | MEDIUM (20-44) | HIGH (45-69) | CRITICAL (70-100)

## Architecture

```
Claude Code <-> MCP stdio <-> deficlaw server
                                 |
                    +------------+------------+
                    |            |            |
              DexScreener    GMGN API    Solana RPC
              (prices)     (holders)    (security)
```

- **MCP SDK** for Claude Code integration
- **curl-based GMGN fetcher** bypasses Cloudflare (Playwright fallback if needed)
- **In-memory TTL cache** with automatic cleanup prevents rate limiting
- **Rate limiter** with retry logic for DexScreener (150 req/min)
- **TypeScript** with full type safety

## Configuration

### Environment Variables (all optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Custom Solana RPC endpoint |
| `DEFICLAW_CACHE_TTL` | `120000` (2 min) | GMGN holder cache TTL in milliseconds |
| `DEFICLAW_PRICE_CACHE_TTL` | `30000` (30s) | Price cache TTL in milliseconds |
| `DEBUG` | (unset) | Set to `deficlaw` to enable debug logging to stderr |

### Claude Code Config

Add to your project's `.mcp.json`:

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

Or if installed from source:

```json
{
  "mcpServers": {
    "defi": {
      "command": "node",
      "args": ["/path/to/deficlaw/dist/index.js"]
    }
  }
}
```

## Roadmap

- [x] Token analysis with holder intelligence
- [x] Risk scoring (8 dimensions)
- [x] Contract security checks
- [x] KOL detection with Twitter handles
- [x] Human-readable AI summary
- [x] Top traders (winners/losers)
- [x] npm package (`npm install -g @0xprotovox/deficlaw`)
- [x] Token search by name/symbol
- [x] New launches detection
- [x] Actionable verdict (BUY/SELL/NEUTRAL/AVOID)
- [x] Configurable cache TTL via env vars
- [x] Debug logging (DEBUG=deficlaw)
- [x] Non-blocking async GMGN fetches
- [ ] Slippage estimation (Jupiter quotes)
- [ ] Token comparison (side by side)
- [ ] Multi-chain holder analysis
- [ ] Price alerts via MCP resources

## Built With

- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) - MCP server framework
- [DexScreener API](https://docs.dexscreener.com) - Price and market data
- [GMGN](https://gmgn.ai) - Holder intelligence
- TypeScript, Zod, Node.js 18+

## License

MIT

## Author

**@0xprotovox** - [Twitter](https://x.com/0xprotovox) | [GitHub](https://github.com/0xprotovox)

20 years building software. Now building AI trading agents and DeFi tools.
