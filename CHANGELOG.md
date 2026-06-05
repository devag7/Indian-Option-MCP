# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-05

### 🎉 Initial Release

The first public release of Indian Option MCP Server — a free, open-source MCP server for Indian options market analysis.

### Added

#### Core Tools (27 total)
- **Option Chain** — Full chain with strikes, LTP, OI, IV, volume, bid/ask
- **Greeks Calculator** — Delta, Gamma, Theta, Vega, Rho via Black-Scholes
- **IV Solver** — Implied Volatility from market price (Newton-Raphson)
- **Option Pricer** — Theoretical price using Black-Scholes model
- **What-If Analysis** — Scenario analysis for Greeks under hypothetical conditions

#### Strategy Builder (34 strategies)
- Bullish: Bull Call Spread, Bull Put Spread, Call Backspread, Synthetic Long, etc.
- Bearish: Bear Call Spread, Bear Put Spread, Put Backspread, Synthetic Short, etc.
- Neutral: Iron Condor, Iron Butterfly, Short Straddle, Short Strangle, etc.
- Volatility: Long Straddle, Long Strangle, Long Call Butterfly, Calendar Spread, etc.

#### Open Interest Analysis
- Max Pain calculator
- Put-Call Ratio (PCR) with interpretation
- OI-based support & resistance levels
- Change-in-OI pattern analysis

#### IV Analytics
- IV Smile curve across strikes
- Expected Move calculator

#### Risk Management
- Probability of Profit (log-normal distribution)
- Position sizing calculator
- Margin estimation (SPAN + Exposure)

#### Market Tools
- Market status (open/closed/pre-open)
- Market overview (NIFTY, BANKNIFTY)
- Lot size lookup
- Next expiry date finder

#### Scanners
- High OI buildup detection
- Unusual activity scanner (volume/OI ratio)

### Architecture
- **24/7 Availability** — Dual-endpoint fallback: primary NSE API during market hours, fallback to `/api/liveEquity-derivatives` after hours
- **esbuild Bundle** — Single 857KB file eliminates ESM module resolution issues in Claude Desktop
- **Rate Limiting** — 3-second minimum gap between NSE requests
- **Session Management** — Auto-refreshing cookies every 5 minutes
- **Retry Logic** — Exponential backoff with up to 3 retries

### Supported Platforms
- Claude Desktop (macOS, Windows, Linux)
- Any MCP-compatible client

[1.0.0]: https://github.com/devag7/Indian-Option-MCP/releases/tag/v1.0.0
