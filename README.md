<p align="center">
  <img src="https://img.shields.io/badge/🇮🇳_Indian_Options-MCP_Server-orange?style=for-the-badge&labelColor=1a1a2e" alt="Indian Option MCP" />
</p>

<h1 align="center">Indian Option MCP Server</h1>

<p align="center">
  <strong>Real-time Indian options analytics, strategy building &amp; market intelligence — right inside Claude Desktop.</strong>
</p>

<p align="center">
  <a href="https://github.com/devag7/Indian-Option-MCP/stargazers"><img src="https://img.shields.io/github/stars/devag7/Indian-Option-MCP?style=flat-square&color=FFD700" alt="Stars" /></a>
  <a href="https://www.npmjs.com/package/indian-option-mcp"><img src="https://img.shields.io/npm/v/indian-option-mcp?style=flat-square&color=CB3837" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/indian-option-mcp"><img src="https://img.shields.io/npm/dm/indian-option-mcp?style=flat-square&color=blue" alt="Downloads" /></a>
  <a href="https://github.com/devag7/Indian-Option-MCP/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/devag7/Indian-Option-MCP/ci.yml?branch=main&style=flat-square&label=CI" alt="CI" /></a>
  <a href="https://glama.ai/mcp/servers/devag7/Indian-Option-MCP"><img src="https://glama.ai/mcp/servers/devag7/Indian-Option-MCP/badge" alt="Glama MCP" /></a>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js_20+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/MCP_SDK-Claude_Desktop-8B5CF6?style=flat-square" alt="MCP" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/data-NSE_India-blue?style=flat-square" alt="NSE" />
  <img src="https://img.shields.io/badge/strategies-34+-ff6b6b?style=flat-square" alt="Strategies" />
  <img src="https://img.shields.io/badge/tools-27+-ffd93d?style=flat-square" alt="Tools" />
  <img src="https://img.shields.io/badge/24%2F7_Available-even_after_hours-brightgreen?style=flat-square" alt="24/7" />
  <img src="https://img.shields.io/badge/zero_external-trading_deps-2d3436?style=flat-square" alt="No external deps" />
</p>

<p align="center">
  <em>A Sensibull-replacement that lives inside your AI assistant. Ask Claude to build iron condors, calculate Greeks, scan for unusual OI activity, and more — with live NSE data, available 24/7 (even after market hours).</em>
</p>

---

## 🆓 Free Alternative to Sensibull & Opstra

| Feature | Sensibull (₹1500/mo) | Opstra (₹999/mo) | **Indian Option MCP (Free)** |
|:---|:---:|:---:|:---:|
| Option Chain | ✅ | ✅ | ✅ **Live from NSE** |
| Strategy Builder | ✅ (20+) | ✅ (15+) | ✅ **34 strategies** |
| Greeks Calculator | ✅ | ✅ | ✅ **Black-Scholes** |
| Max Pain | ✅ | ✅ | ✅ |
| OI Analysis | ✅ | ✅ | ✅ |
| IV Smile/Skew | ❌ | ✅ | ✅ |
| Position Sizing | ❌ | ❌ | ✅ |
| Margin Estimation | ❌ | ❌ | ✅ |
| Probability of Profit | ❌ | ❌ | ✅ |
| AI-Powered Analysis | ❌ | ❌ | ✅ **Claude AI** |
| Natural Language | ❌ | ❌ | ✅ **"Build me an Iron Condor"** |
| API/Programmatic | ❌ | ❌ | ✅ **MCP Protocol** |
| **Price** | **₹1500/month** | **₹999/month** | **🆓 Forever Free** |

---

## ✨ Why Indian Option MCP?

| Pain Point | Old Way | With This MCP |
|:---|:---|:---|
| Checking option chains | Open Sensibull/NSE website, scroll, compare | *"Show me NIFTY option chain"* |
| Building strategies | Manually pick strikes, calculate P&L | *"Build an iron condor on BANKNIFTY"* |
| Greeks analysis | Open Black-Scholes calculator, enter values | *"What are the Greeks for NIFTY 24000 CE?"* |
| Finding support/resistance from OI | Stare at OI columns, do mental math | *"Where is the highest OI in NIFTY?"* |
| Position sizing | Spreadsheet + guesswork | *"Size a position for ₹5L capital, 2% risk"* |
---

## 🕐 24/7 Availability — Works Even After Market Hours

Most NSE tools and scrapers **break after 3:30 PM IST** because NSE takes down the option chain API. This MCP server uses a **dual-endpoint fallback architecture**:

| Time | Data Source | What You Get |
|:---|:---|:---|
| **9:15 AM – 3:30 PM** (Market Open) | Primary NSE API | Full chain with IV, Greeks, change-in-OI, bid/ask |
| **After 3:30 PM** (Market Closed) | Fallback derivatives API | Closing snapshot with OI, LTP, volume, strike prices |

> **No configuration needed.** The fallback is automatic. You always get data, any time of day.

---

## 🚀 Features

### 📊 Option Chain Tools
| Tool | Description |
|:-----|:------------|
| `get_option_chain` | Full option chain with strikes, LTP, OI, IV, volume, bid/ask for calls & puts |
| `get_expiry_dates` | All available expiry dates for any F&O symbol |
| `get_spot_price` | Current spot/underlying price of any stock or index |

### 🔢 Greeks & Pricing
| Tool | Description |
|:-----|:------------|
| `calculate_greeks` | All Greeks — Delta, Gamma, Theta, Vega, Rho — via Black-Scholes |
| `calculate_iv` | Implied Volatility from market price (Newton-Raphson method) |
| `calculate_option_price` | Theoretical option price using Black-Scholes model |
| `what_if_greeks` | Scenario analysis — how Greeks change under hypothetical conditions |

### 🏗️ Strategy Builder — *34 Pre-Built Strategies*
| Tool | Description |
|:-----|:------------|
| `build_strategy` | Build any of 34 strategies with real market prices, payoff & breakevens |
| `custom_strategy` | Build custom multi-leg strategies with specific strikes |
| `suggest_strategy` | Get strategy suggestions based on outlook & risk preference |
| `list_strategies` | Browse all available strategies by category |
| `calculate_payoff` | Payoff/P&L table at expiry across price scenarios |

### 📈 Open Interest Analysis
| Tool | Description |
|:-----|:------------|
| `calculate_max_pain` | Max Pain strike — where option buyers lose the most |
| `get_pcr` | Put-Call Ratio (OI, Volume, and Change based) with interpretation |
| `highest_oi_strikes` | OI-based support & resistance levels |
| `oi_change_analysis` | Change in OI patterns — emerging support/resistance |

### 📉 IV Analytics
| Tool | Description |
|:-----|:------------|
| `iv_smile` | IV Smile curve + IV Skew across strikes |
| `expected_move` | Expected price range by expiry (1σ, 1.645σ, 1.96σ) |

### 🌍 Market Data
| Tool | Description |
|:-----|:------------|
| `market_overview` | NIFTY & BANKNIFTY snapshot — spot, ATM IV, PCR, lot size |
| `market_status` | Is the NSE market currently open or closed? |
| `lot_size` | Lot size for any F&O instrument |
| `next_expiry` | Next weekly/monthly expiry date |

### 🛡️ Risk Management
| Tool | Description |
|:-----|:------------|
| `estimate_margin` | SPAN + Exposure margin estimate for option strategies |
| `probability_of_profit` | POP calculation using log-normal distribution |
| `position_sizing` | Optimal lot count based on capital & risk tolerance |

### 🔍 Scanners
| Tool | Description |
|:-----|:------------|
| `scan_high_oi` | Find strikes with highest institutional OI buildup |
| `unusual_activity` | Detect abnormally high volume/OI ratio |

### 💬 MCP Prompts
| Prompt | Description |
|:-------|:------------|
| `strategy_advisor` | Full strategy recommendation workflow — chains, PCR, max pain, expected move, build & size |
| `market_analysis` | Comprehensive analysis — OI, PCR, IV smile, max pain, expected move synthesized |

---

## ⚡ Quick Start

### Option 1: npx (Recommended — Zero Install)

Add this to your Claude Desktop config:

```jsonc
{
  "mcpServers": {
    "indian-options": {
      "command": "npx",
      "args": ["-y", "indian-option-mcp"]
    }
  }
}
```

Restart Claude Desktop. Done. 🎉

### Option 2: Clone & Build

```bash
# Clone the repository
git clone https://github.com/devag7/Indian-Option-MCP.git
cd Indian-Option-MCP

# Install dependencies & build
npm install
npm run build
```

### Configure Claude Desktop

Add this to your Claude Desktop config file:

<details>
<summary><strong>📍 Config file locations</strong></summary>

| OS | Path |
|:---|:-----|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

</details>

```jsonc
{
  "mcpServers": {
    "indian-options": {
      "command": "node",
      "args": ["/absolute/path/to/Indian-Option-MCP/dist/bundle.mjs"],
      "env": {
        "DATA_PROVIDER": "nse"
      }
    }
  }
}
```

> **That's it.** Restart Claude Desktop and start asking about Indian options! 🎉

---

## 💬 Example Conversations

Once configured, just talk naturally to Claude:

```
You: Show me the NIFTY option chain for the nearest expiry

You: Build an iron condor on BANKNIFTY with 3 strikes OTM

You: What's the max pain for NIFTY? Where is OI-based support?

You: I'm bullish on RELIANCE. Suggest a strategy with low risk.

You: Calculate Greeks for NIFTY 24500 CE, 10 days to expiry, 14% IV

You: Show the expected move for NIFTY at 95% confidence

You: Size a short straddle on BANKNIFTY for ₹10L capital, max 2% risk
```

---

## 🏗️ Strategy Library

All **34** pre-built strategies, ready to deploy with live market prices:

<table>
<tr>
<td>

#### 📈 Bullish
| Strategy | Legs |
|:---------|:----:|
| `long_call` | 1 |
| `bull_call_spread` | 2 |
| `bull_put_spread` | 2 |
| `put_credit_spread` | 2 |
| `synthetic_long` | 2 |
| `covered_call` | 2 |
| `collar` | 3 |
| `strap` | 2 |
| `jade_lizard` | 3 |

</td>
<td>

#### 📉 Bearish
| Strategy | Legs |
|:---------|:----:|
| `long_put` | 1 |
| `bear_put_spread` | 2 |
| `bear_call_spread` | 2 |
| `put_debit_spread` | 2 |
| `call_credit_spread` | 2 |
| `synthetic_short` | 2 |
| `protective_put` | 2 |
| `strip` | 2 |

</td>
</tr>
<tr>
<td>

#### ⚖️ Neutral
| Strategy | Legs |
|:---------|:----:|
| `short_straddle` | 2 |
| `short_strangle` | 2 |
| `iron_condor` | 4 |
| `iron_butterfly` | 4 |
| `butterfly` | 3 |
| `calendar_spread` | 2 |
| `double_diagonal` | 4 |

</td>
<td>

#### 🌊 Volatility
| Strategy | Legs |
|:---------|:----:|
| `long_straddle` | 2 |
| `long_strangle` | 2 |
| `back_spread_call` | 2 |
| `back_spread_put` | 2 |
| `ratio_call_spread` | 2 |
| `ratio_put_spread` | 2 |
| `short_call` | 1 |
| `short_put` | 1 |
| `broken_wing_butterfly` | 3 |
| `christmas_tree` | 3 |

</td>
</tr>
</table>

> 💡 **Tip:** Use `list_strategies` to browse by category, or `suggest_strategy` to get recommendations based on your market view.

---

## 🔌 Data Providers

| Provider | API Key | Features | Speed |
|:---------|:-------:|:---------|:-----:|
| **NSE India** (default) | ❌ Not needed | Full option chains, OI, IV, volume, spot prices | ⚡ Fast |
| **Zerodha Kite** (optional) | ✅ Required | Full option chains, tick-level data, order book depth | ⚡⚡ Faster |

### NSE (Default — Zero Config)

Works out of the box. The server fetches data directly from NSE India's public endpoints.

```bash
# No configuration needed — just build and run
DATA_PROVIDER=nse  # this is the default
```

### Zerodha Kite (Optional)

For traders with a Zerodha account who want faster data and deeper order book:

```bash
DATA_PROVIDER=zerodha
KITE_API_KEY=your_api_key
KITE_API_SECRET=your_api_secret
KITE_ACCESS_TOKEN=your_access_token  # refreshed daily
```

> Get credentials from [developers.kite.trade](https://developers.kite.trade/)

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and configure as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|:---------|:--------|:------------|
| `DATA_PROVIDER` | `nse` | Data source — `nse` (free) or `zerodha` (needs API key) |
| `KITE_API_KEY` | — | Zerodha Kite API key (only if `zerodha`) |
| `KITE_API_SECRET` | — | Zerodha Kite API secret (only if `zerodha`) |
| `KITE_ACCESS_TOKEN` | — | Zerodha session token, refreshed daily (only if `zerodha`) |
| `CACHE_TTL_SECONDS` | `5` | Real-time data cache lifetime in seconds |
| `INSTRUMENT_CACHE_TTL_HOURS` | `12` | Instrument master cache lifetime in hours |
| `RISK_FREE_RATE` | `0.07` | Annual risk-free rate for Black-Scholes (7% = Indian 10Y bond) |
| `LOG_LEVEL` | `info` | Logging verbosity — `debug`, `info`, `warn`, `error` |

---

## 🏛️ Architecture

```
indian-option-mcp/
├── src/
│   ├── index.ts                    # Entry point — stdio transport
│   ├── server.ts                   # MCP server — all 35+ tools registered here
│   ├── config.ts                   # Zod-validated env configuration
│   │
│   ├── data/
│   │   ├── providers/
│   │   │   ├── base.provider.ts    # Abstract data provider interface
│   │   │   ├── nse.provider.ts     # NSE India scraper (default)
│   │   │   └── zerodha.provider.ts # Kite Connect API client
│   │   ├── provider-factory.ts     # Provider factory pattern
│   │   ├── cache/
│   │   │   ├── memory-cache.ts     # TTL-based in-memory cache
│   │   │   └── instrument-cache.ts # Long-lived instrument master cache
│   │   ├── constants/
│   │   │   ├── lot-sizes.ts        # F&O lot sizes (NIFTY=75, BANKNIFTY=30, etc.)
│   │   │   ├── expiry-calendar.ts  # Expiry date calculations
│   │   │   └── indices.ts          # Index metadata & strike intervals
│   │   └── models/
│   │       ├── option-chain.ts     # Option chain data models
│   │       ├── instrument.ts       # Instrument definitions
│   │       ├── quote.ts            # Quote/tick models
│   │       ├── strategy.ts         # Strategy type definitions
│   │       └── index.ts            # Model barrel exports
│   │
│   ├── engine/
│   │   ├── black-scholes.ts        # Option pricing & Greeks (Δ, Γ, Θ, ν, ρ)
│   │   ├── implied-volatility.ts   # IV solver (Newton-Raphson)
│   │   ├── iv-surface.ts           # IV Smile, Skew, Rank, Percentile, HV
│   │   ├── strategy-builder.ts     # 34 strategy templates + builder
│   │   ├── payoff.ts               # Payoff/P&L at expiry engine
│   │   ├── max-pain.ts             # Max Pain calculator
│   │   ├── pcr.ts                  # Put-Call Ratio analyzer
│   │   ├── oi-analysis.ts          # OI distribution & activity detection
│   │   ├── margin-calculator.ts    # SPAN margin estimator
│   │   └── risk-metrics.ts         # POP, Kelly, position sizing
│   │
│   └── utils/
│       ├── date.ts                 # Market hours, DTE, expiry helpers
│       ├── format.ts               # Currency, number, OI formatting
│       ├── math.ts                 # Normal CDF, statistical functions
│       └── logger.ts               # Stderr-only logger (MCP-safe)
│
├── dist/                           # Compiled output
├── package.json
├── tsconfig.json
└── .env.example
```

### Design Principles

- **Zero external trading dependencies** — only `@modelcontextprotocol/sdk` and `zod`
- **Provider pattern** — swap between NSE and Zerodha with one env variable
- **Pure computation engine** — all pricing, Greeks, and analytics are self-contained
- **MCP-safe logging** — all output goes to `stderr`, never `stdout` (protects stdio transport)
- **Startup validation** — Zod schemas validate all config at boot, not at runtime

---

## 🛠️ Development

```bash
# Watch mode (recompile on save)
npm run dev

# Type-check without emitting
npm run lint

# Run tests
npm test

# Inspect with MCP Inspector
npm run inspect

# Clean build artifacts
npm run clean
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch — `git checkout -b feat/my-feature`
3. **Commit** your changes — `git commit -m "feat: add my feature"`
4. **Push** to your branch — `git push origin feat/my-feature`
5. **Open** a Pull Request

### Areas for Contribution

- 🆕 New strategies (e.g., seagull, condor variations)
- 🌐 Additional data providers (Upstox, Angel One, etc.)
- 📊 Enhanced analytics (IV term structure, correlation analysis)
- 🧪 Test coverage for engine modules
- 📚 Documentation improvements

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Built with ❤️ for the Indian options trading community</strong>
  <br />
  <sub>If this project saved you a Sensibull subscription, consider giving it a ⭐</sub>
</p>
