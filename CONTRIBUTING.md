# Contributing to Indian Option MCP

Thank you for your interest in contributing! This project aims to provide the best free options analytics tool for Indian markets.

## 🏁 Quick Start

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/Indian-Option-MCP.git
cd Indian-Option-MCP

# Install dependencies
npm install

# Build
npm run build

# Run in development mode (watch)
npm run dev

# Test with MCP Inspector
npm run inspect
```

## 📁 Project Structure

```
src/
├── index.ts              # Entry point (stdio transport)
├── server.ts             # MCP server with all tool definitions
├── data/
│   ├── providers/        # Data providers (NSE, Zerodha)
│   ├── constants/        # Lot sizes, expiry calendar, indices
│   └── cache/            # TTL-based caching
├── engine/               # Pure computation (Black-Scholes, strategies, OI)
└── utils/                # Formatting, date, math utilities
```

## 🎯 Areas for Contribution

### 🆕 New Features
- **Additional data providers**: Upstox, Angel One, Dhan, Groww
- **New strategies**: Seagull, condor variations, calendar spreads
- **Enhanced analytics**: IV term structure, correlation analysis, Greeks surface
- **Alerts**: Price/OI/IV threshold notifications

### 🐛 Bug Fixes
- Edge cases in Black-Scholes near expiry
- NSE session handling improvements
- Error handling for market-closed scenarios

### 📚 Documentation
- Usage examples with screenshots
- Strategy explanations with payoff diagrams
- API documentation for each tool

### 🧪 Testing
- Unit tests for engine modules (Black-Scholes, IV solver)
- Integration tests with mock NSE data
- Snapshot tests for tool output formatting

## 📝 Code Guidelines

1. **TypeScript strict mode** — all code must pass `tsc --noEmit`
2. **No external trading dependencies** — keep the core lightweight
3. **MCP-safe logging** — always use `console.error()`, never `console.log()`
4. **Pure functions in engine/** — no side effects, no network calls
5. **JSDoc comments** — document all public functions

## 🔄 Pull Request Process

1. **Fork** and create a feature branch from `main`
2. **Write** your code following the guidelines above
3. **Test** with MCP Inspector: `npm run inspect`
4. **Commit** with conventional commit messages:
   - `feat: add butterfly strategy`
   - `fix: handle zero OI in PCR calculation`
   - `docs: add iron condor example`
5. **Push** and open a PR against `main`

## 💬 Need Help?

- Open an [issue](https://github.com/devag7/Indian-Option-MCP/issues) for bugs or feature requests
- Check existing issues before creating new ones
- Use the `help-wanted` label to find good first issues

---

**Every contribution, no matter how small, makes this project better for the Indian trading community. 🇮🇳**
