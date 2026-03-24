# DefiClaw

**The first open-source DeFi MCP server for Claude Code.**

Analyze any Solana token in seconds. Holder intelligence, risk scoring, smart money tracking, KOL detection. Zero API keys required.

```
> "analyze token 3oQwNvAfZMuPWjVPC12ukY7RPA9JiGwLod6Pr4Lkpump"

═══ SUMMARY ═══
POKE6900 is a 9mo old PumpSwap token with $25.9K liquidity and $34.5K market cap.
53 diamond hands (53.0%), strong holder conviction.
Only 18.0% of holders are in profit, most are underwater with avg loss of $844 per wallet.
Buy pressure is strong at 3.3:1 ratio (1093 buys vs 395 sells), accumulation phase.
Contract looks safe: mint and freeze authorities revoked.
🟢 Lower risk profile based on available data.
```

## Why deficlaw?

Claude Code can write code, fix bugs, deploy apps. But ask it "what's the price of BONK?" and it says *"I don't have real-time data."*

**deficlaw fixes that.** It gives Claude Code real-time access to DeFi data across Solana and 10+ chains.

- **Token Analysis** with holder intelligence, risk scoring, KOL tracking
- **Real-time Prices** from DexScreener across all major chains
- **Trending Tokens** with volume, liquidity, and boost data
- **Top Traders** showing who made and lost money on any token
- **Contract Security** checking mint/freeze authority on Solana
- **1.5 second** full analysis (not 11 seconds like browser-based scrapers)
- **Zero config** - no API keys, no wallets, no accounts needed

## Quick Start

```bash
# Clone and build
git clone https://github.com/0xprotovox/deficlaw.git
cd deficlaw
npm install && npm run build

# Add to Claude Code
claude mcp add defi -- node /path/to/deficlaw/dist/index.js
```

Then just ask Claude naturally:

```
> "analyze this token: 3oQw...pump"
> "what's the price of BONK?"
> "show me trending tokens on solana"
> "who made money on JUP token?"
```

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

### `get_price`

Quick price lookup. Sub-second response.

```
> "price of So11111112222..."

BONK — $0.000024 (+5.2% 24h)
Volume: $142M | Liquidity: $12M | MCap: $1.8B
```

### `get_trending`

Trending and boosted tokens on any chain.

```
> "trending tokens on solana"

1. BONK — $0.000024 (+12%) — $142M volume
2. WIF  — $0.89 (-2.1%)   — $89M volume
3. JUP  — $0.94 (+3.5%)   — $45M volume
...
```

### `get_top_traders`

Who made and lost money on a token. Winners, losers, PnL, tags.

```
> "who profited on this token?"

🏆 Top Winners:
1. CR5N... — +$680 (+124%) 🟢 still holding
2. EsRB... — +$166 (+16%) 💎 diamond hands

💀 Top Losers:
1. BgeeV... — -$7,548 (-65%) 💎 diamond hands (!)
2. 5vqid... — -$5,420 (-50%) gmgn user
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

The risk scorer analyzes 6 dimensions to produce a 0-100 score:

| Dimension | Weight | What it checks |
|-----------|--------|----------------|
| Liquidity | 25% | Pool depth in USD |
| Token Age | 10% | Time since creation |
| Holder Concentration | 20% | Top 10 holder % |
| Dev Wallet | 20% | Dev holdings and selling behavior |
| Fresh Wallets | 15% | New wallet % (possible wash/bundle) |
| Sniper Activity | 10% | Bot/sniper wallets in top holders |

**Levels:** 🟢 LOW (0-19) | 🟡 MEDIUM (20-44) | 🟠 HIGH (45-69) | 🔴 CRITICAL (70-100)

## Architecture

```
Claude Code ←→ MCP stdio ←→ deficlaw server
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
              DexScreener    GMGN API    Solana RPC
              (prices)     (holders)    (security)
```

- **MCP SDK** for Claude Code integration
- **curl-based GMGN fetcher** bypasses Cloudflare (Playwright fallback if needed)
- **In-memory TTL cache** prevents rate limiting
- **Rate limiter** for DexScreener (150 req/min)
- **TypeScript** with full type safety

## Configuration

### Environment Variables (all optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLANA_RPC_URL` | `https://api.mainnet-beta.solana.com` | Custom Solana RPC endpoint |

### Claude Code Config

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "defi": {
      "command": "node",
      "args": ["/path/to/deficlaw/dist/index.js"],
      "env": {
        "SOLANA_RPC_URL": "https://your-rpc.com"
      }
    }
  }
}
```

## Roadmap

- [x] Token analysis with holder intelligence
- [x] Risk scoring (6 dimensions)
- [x] Contract security checks
- [x] KOL detection with Twitter handles
- [x] Human-readable AI summary
- [x] Top traders (winners/losers)
- [ ] Token search by name/symbol
- [ ] Slippage estimation (Jupiter quotes)
- [ ] Token comparison (side by side)
- [ ] Multi-chain holder analysis
- [ ] npm package (`npm install -g deficlaw`)
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
