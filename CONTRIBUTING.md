# Contributing to Indian Option MCP

Thank you for your interest in contributing! This project aims to be the best free options analytics tool for Indian markets.

## 🚀 Quick Start

```bash
git clone https://github.com/devag7/Indian-Option-MCP.git
cd Indian-Option-MCP
npm install
npm run build     # tsc + esbuild bundle
npm test          # run tests
npm run inspect   # open MCP Inspector
```

## 🔄 Development Workflow

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feat/your-feature`
3. **Make changes** in `src/`
4. **Type-check**: `npm run lint`
5. **Test**: `npm test`
6. **Build**: `npm run build`
7. **Commit** with [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` — New feature
   - `fix:` — Bug fix
   - `docs:` — Documentation
   - `refactor:` — Code refactoring
8. **Push** and open a Pull Request

## 📁 Project Structure

```
src/
├── index.ts              # Entry point (StdioServerTransport)
├── server.ts             # MCP tool definitions (27 tools)
├── data/
│   ├── providers/
│   │   ├── base.provider.ts    # Abstract data provider
│   │   ├── nse.provider.ts     # NSE India (free, default)
│   │   └── zerodha.provider.ts # Zerodha Kite API
│   └── provider-factory.ts     # Provider selection
├── engines/
│   ├── greeks.engine.ts        # Black-Scholes + Greeks
│   └── strategy.engine.ts      # 34 pre-built strategies
├── utils/
│   ├── cache.ts                # TTL cache for API responses
│   ├── formatting.ts           # Number/table formatting
│   └── math.ts                 # Statistical functions
└── reference/
    └── indices.ts              # Index metadata (lot sizes, etc.)
```

## 🧪 Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

### Smoke Test

```bash
# Verify the server responds to MCP initialize:
printf '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}\n' | node dist/bundle.mjs 2>/dev/null | head -1
```

## 🎯 Areas for Contribution

### High Impact
- [ ] **Historical IV data** — IV percentile/rank over 30/60/90 days
- [ ] **Multi-expiry OI analysis** — Compare OI across expiries
- [ ] **Trade journal** — Log and track trades with P&L
- [ ] **Portfolio Greeks** — Aggregate Greeks across multiple positions
- [ ] **Backtesting** — "How would this strategy have performed?"

### Medium Impact
- [ ] **Additional data providers** — Upstox, Angel One, Dhan
- [ ] **Equity stock options** — Expand beyond index options
- [ ] **More strategies** — Ratio spreads, diagonal spreads
- [ ] **Alerts** — "Notify when NIFTY crosses 24000"

### Documentation
- [ ] **Video tutorial** — Setup and usage walkthrough
- [ ] **Strategy guides** — When to use which strategy
- [ ] **API documentation** — Detailed tool parameter docs

## 📋 Release Process

Releases are automated via GitHub Actions:

1. Update version: `npm version patch|minor|major`
2. Push the tag: `git push --tags`
3. CI validates → publishes to npm → creates GitHub Release

## 📜 License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
