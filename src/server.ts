/**
 * @module server
 * MCP Server setup — creates the McpServer instance and registers all tools,
 * resources, and prompts for the Indian Options analytics platform.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { createDataProvider } from './data/provider-factory.js';
import { MemoryCache } from './data/cache/memory-cache.js';

// Engine imports
import { optionPrice, calculateGreeks } from './engine/black-scholes.js';
import { calculateIV } from './engine/implied-volatility.js';
import { calculatePayoffAtExpiry, findBreakevens } from './engine/payoff.js';
import { calculateMaxPain } from './engine/max-pain.js';
import { calculatePCR } from './engine/pcr.js';
import { analyzeOIDistribution, detectOIActivity } from './engine/oi-analysis.js';
import {
  calculateIVSmile, calculateIVSkew, calculateIVRank, calculateIVPercentile,
  calculateHistoricalVolatility, hvVsIvAnalysis, expectedMove,
} from './engine/iv-surface.js';
import { STRATEGIES, buildStrategy, suggestStrategies, listStrategies } from './engine/strategy-builder.js';
import { estimateMargin } from './engine/margin-calculator.js';
import { probabilityOfProfit, riskRewardRatio, kellyFraction, optimalPositionSize } from './engine/risk-metrics.js';

// Constants
import { getLotSize } from './data/constants/lot-sizes.js';
import { getNextExpiry, getAllExpiries, isExpiryDay as checkExpiryDay } from './data/constants/expiry-calendar.js';
import { INDICES, getIndexByTradingSymbol } from './data/constants/indices.js';

// Utils
import { daysToExpiry, isMarketOpen, getMarketStatusInfo } from './utils/date.js';
import { formatCurrency, formatNumber, formatPercent, formatLargeNumber, formatOI } from './utils/format.js';

// Types — use the provider's own interface, not the model
import type { OptionChainData, OptionData } from './data/providers/base.provider.js';

const provider = createDataProvider();
const chainCache = new MemoryCache<OptionChainData>({ maxSize: 50, ttlMs: 10000 });

// ── Lazy provider initialization ─────────────────────────────────────────
// Claude Desktop has a strict timeout on MCP server startup.
// NSE cookie fetch can take 10-15s → we MUST NOT block createServer().
// Instead, the provider initializes lazily on the first tool call.
let providerReady = false;
let providerInitPromise: Promise<void> | null = null;

async function ensureProvider(): Promise<void> {
  if (providerReady) return;
  if (!providerInitPromise) {
    providerInitPromise = provider.initialize().then(() => {
      providerReady = true;
      console.error('Data provider initialized: ' + (provider as { name: string }).name);
    }).catch((err) => {
      providerInitPromise = null; // allow retry
      throw err;
    });
  }
  await providerInitPromise;
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'indian-option-mcp',
    version: '1.1.0',
  });

  // Fire-and-forget: start init in background (but don't block server startup)
  ensureProvider().catch(() => {});

  // Helper to get cached option chain (ensures provider is ready)
  async function getChain(symbol: string, expiry?: string): Promise<OptionChainData> {
    await ensureProvider();
    const key = `${symbol}:${expiry || 'nearest'}`;
    return chainCache.getOrFetch(key, () => provider.getOptionChain(symbol, expiry));
  }

  // Helper: get index info (strike interval etc)
  function getStrikeInterval(symbol: string): number {
    const info = getIndexByTradingSymbol(symbol);
    return info?.strikeInterval ?? 50;
  }

  // ════════════════════════════════════════════════════════════
  // OPTION CHAIN TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'get_option_chain',
    'Get the complete option chain for an Indian F&O symbol (NIFTY, BANKNIFTY, RELIANCE, etc.) with strike prices, LTP, Open Interest, IV, volume, bid/ask for both calls and puts.',
    {
      symbol: z.string().describe('Underlying symbol, e.g. NIFTY, BANKNIFTY, RELIANCE'),
      expiry: z.string().optional().describe('Expiry date (DD-Mon-YYYY or YYYY-MM-DD). Defaults to nearest expiry.'),
      strike_range: z.number().optional().describe('Number of strikes around ATM to include (default: 10)'),
    },
    async ({ symbol, expiry, strike_range }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const range = strike_range ?? 10;
      const spotPrice = chain.underlyingValue;

      // Filter to strikes near ATM
      let filteredData = chain.rows;
      if (range > 0) {
        const sorted = [...chain.rows].sort((a, b) =>
          Math.abs(a.strikePrice - spotPrice) - Math.abs(b.strikePrice - spotPrice)
        );
        const nearbyStrikes = new Set(sorted.slice(0, range * 2).map(d => d.strikePrice));
        filteredData = chain.rows.filter(d => nearbyStrikes.has(d.strikePrice));
      }

      // Format as a readable table
      const lines = [
        `📊 Option Chain: ${symbol} | Spot: ₹${formatNumber(spotPrice)}`,
        `📅 Expiry: ${filteredData[0]?.expiryDate || expiry || 'nearest'}`,
        `⏰ Last Updated: ${chain.timestamp}`,
        '',
        'CALLS                                    |  Strike  |                                    PUTS',
        'OI        Chg OI    Volume   IV%     LTP  |          |  LTP     IV%    Volume   Chg OI      OI',
        '-'.repeat(105),
      ];

      for (const row of filteredData.sort((a, b) => a.strikePrice - b.strikePrice)) {
        const isATM = Math.abs(row.strikePrice - spotPrice) <= getStrikeInterval(symbol.toUpperCase()) / 2;
        const marker = isATM ? '→' : ' ';

        const ce = row.CE;
        const pe = row.PE;

        const ceStr = ce
          ? `${formatOI(ce.openInterest).padStart(8)} ${(ce.changeinOpenInterest >= 0 ? '+' : '') + formatOI(ce.changeinOpenInterest).padStart(7)} ${formatOI(ce.totalTradedVolume).padStart(8)} ${(ce.impliedVolatility?.toFixed(1) || '-').padStart(6)} ${ce.lastPrice.toFixed(2).padStart(8)}`
          : ' '.repeat(45);
        const peStr = pe
          ? `${pe.lastPrice.toFixed(2).padEnd(8)} ${(pe.impliedVolatility?.toFixed(1) || '-').padEnd(6)} ${formatOI(pe.totalTradedVolume).padEnd(8)} ${(pe.changeinOpenInterest >= 0 ? '+' : '') + formatOI(pe.changeinOpenInterest).padEnd(7)} ${formatOI(pe.openInterest).padEnd(8)}`
          : '';

        lines.push(`${ceStr} |${marker}${row.strikePrice.toString().padStart(7)} | ${peStr}`);
      }

      lines.push('', `Available Expiries: ${chain.expiryDates.slice(0, 8).join(', ')}${chain.expiryDates.length > 8 ? '...' : ''}`);

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'get_expiry_dates',
    'Get all available F&O expiry dates for an Indian stock or index. Use to find weekly/monthly expiries before building strategies. Returns a numbered list of expiry dates sorted chronologically.',
    {
      symbol: z.string().describe('NSE underlying symbol, e.g. NIFTY, BANKNIFTY, RELIANCE, TATASTEEL'),
    },
    async ({ symbol }) => {
      const chain = await getChain(symbol.toUpperCase());
      const expiries = chain.expiryDates;
      const text = [
        `📅 Expiry Dates for ${symbol.toUpperCase()}:`,
        ...expiries.map((e, i) => `  ${i + 1}. ${e}`),
      ].join('\n');
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  server.tool(
    'get_spot_price',
    'Get the current spot/underlying price of an Indian stock or index from NSE. Use this to check the latest price before calculating Greeks or building strategies. Returns spot price with timestamp.',
    {
      symbol: z.string().describe('NSE underlying symbol, e.g. NIFTY, BANKNIFTY, RELIANCE, INFY'),
    },
    async ({ symbol }) => {
      const chain = await getChain(symbol.toUpperCase());
      return {
        content: [{ type: 'text' as const, text: `${symbol.toUpperCase()} Spot Price: ₹${formatNumber(chain.underlyingValue)}` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════
  // GREEKS TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'calculate_greeks',
    'Calculate all Option Greeks (Delta, Gamma, Theta, Vega, Rho) for a given option using Black-Scholes model.',
    {
      spot: z.number().describe('Current underlying price'),
      strike: z.number().describe('Option strike price'),
      expiry_days: z.number().describe('Days to expiry'),
      iv: z.number().describe('Implied Volatility as percentage, e.g. 15 for 15%'),
      type: z.enum(['CE', 'PE']).describe('Option type: CE (Call) or PE (Put)'),
      rate: z.number().optional().describe('Risk-free rate in % (default: 7% for India)'),
    },
    async ({ spot, strike, expiry_days, iv, type, rate }) => {
      const T = Math.max(expiry_days / 365, 1 / (365 * 24));
      const r = (rate ?? 7) / 100;
      const sigma = iv / 100;

      const greeks = calculateGreeks(spot, strike, T, r, sigma, 0, type);
      const price = optionPrice(spot, strike, T, r, sigma, 0, type);

      const text = [
        `🔢 Greeks for ${type} ${strike} (Spot: ₹${spot}, IV: ${iv}%, DTE: ${expiry_days})`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `  Theoretical Price: ₹${price.toFixed(2)}`,
        `  Delta (Δ):  ${greeks.delta.toFixed(4)}    — Price changes ₹${(greeks.delta * 1).toFixed(2)} per ₹1 move`,
        `  Gamma (Γ):  ${greeks.gamma.toFixed(6)}    — Delta changes ${greeks.gamma.toFixed(4)} per ₹1 move`,
        `  Theta (Θ):  ${greeks.theta.toFixed(2)}     — Loses ₹${Math.abs(greeks.theta).toFixed(2)} per day`,
        `  Vega  (ν):  ${greeks.vega.toFixed(2)}     — Changes ₹${greeks.vega.toFixed(2)} per 1% IV change`,
        `  Rho   (ρ):  ${greeks.rho.toFixed(2)}     — Changes ₹${greeks.rho.toFixed(2)} per 1% rate change`,
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  server.tool(
    'calculate_iv',
    'Calculate Implied Volatility from the market price of an option using Newton-Raphson method.',
    {
      market_price: z.number().describe('Current market premium of the option'),
      spot: z.number().describe('Underlying spot price'),
      strike: z.number().describe('Strike price'),
      expiry_days: z.number().describe('Days to expiry'),
      type: z.enum(['CE', 'PE']).describe('Option type'),
      rate: z.number().optional().describe('Risk-free rate % (default: 7)'),
    },
    async ({ market_price, spot, strike, expiry_days, type, rate }) => {
      const T = Math.max(expiry_days / 365, 1 / (365 * 24));
      const r = (rate ?? 7) / 100;
      const iv = calculateIV(market_price, spot, strike, T, r, type);

      if (iv === null) {
        return { content: [{ type: 'text' as const, text: 'Could not converge on IV. Check inputs (option may be deep ITM/OTM or near expiry).' }] };
      }

      return {
        content: [{ type: 'text' as const, text: `Implied Volatility for ${type} ${strike}: ${(iv * 100).toFixed(2)}% (annualized)` }],
      };
    }
  );

  server.tool(
    'calculate_option_price',
    'Calculate theoretical option price using Black-Scholes model.',
    {
      spot: z.number().describe('Underlying price'),
      strike: z.number().describe('Strike price'),
      expiry_days: z.number().describe('Days to expiry'),
      iv: z.number().describe('IV as percentage'),
      type: z.enum(['CE', 'PE']).describe('Option type'),
      rate: z.number().optional().describe('Risk-free rate % (default: 7)'),
    },
    async ({ spot, strike, expiry_days, iv, type, rate }) => {
      const T = Math.max(expiry_days / 365, 1 / (365 * 24));
      const price = optionPrice(spot, strike, T, (rate ?? 7) / 100, iv / 100, 0, type);
      return {
        content: [{ type: 'text' as const, text: `Theoretical ${type} ${strike} price: ₹${price.toFixed(2)} (Spot: ₹${spot}, IV: ${iv}%, DTE: ${expiry_days})` }],
      };
    }
  );

  server.tool(
    'what_if_greeks',
    'What-if scenario: Show how Greeks change under hypothetical spot price, IV, or time conditions.',
    {
      spot: z.number().describe('Hypothetical spot price'),
      strike: z.number().describe('Strike price'),
      iv: z.number().describe('Hypothetical IV %'),
      days_to_expiry: z.number().describe('Hypothetical days to expiry'),
      type: z.enum(['CE', 'PE']).describe('Option type'),
    },
    async ({ spot, strike, iv, days_to_expiry, type }) => {
      const T = Math.max(days_to_expiry / 365, 1 / (365 * 24));
      const greeks = calculateGreeks(spot, strike, T, 0.07, iv / 100, 0, type);
      const price = optionPrice(spot, strike, T, 0.07, iv / 100, 0, type);

      const text = [
        `🔮 What-If: ${type} ${strike} @ Spot ₹${spot}, IV ${iv}%, DTE ${days_to_expiry}`,
        `  Price: ₹${price.toFixed(2)} | Δ ${greeks.delta.toFixed(4)} | Γ ${greeks.gamma.toFixed(6)} | Θ ${greeks.theta.toFixed(2)} | ν ${greeks.vega.toFixed(2)}`,
      ].join('\n');
      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // STRATEGY TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'build_strategy',
    'Build a pre-defined options strategy (Iron Condor, Bull Call Spread, Straddle, etc.) with real market prices for an Indian F&O symbol.',
    {
      symbol: z.string().describe('Underlying symbol'),
      expiry: z.string().optional().describe('Expiry date'),
      strategy_name: z.string().describe('Strategy name: iron_condor, bull_call_spread, short_straddle, long_straddle, bear_put_spread, etc. Use list_strategies to see all.'),
      otm_offset: z.number().optional().describe('Number of strikes away from ATM for OTM legs (default: varies by strategy)'),
    },
    async ({ symbol, expiry, strategy_name, otm_offset }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const spot = chain.underlyingValue;
      const strikeInterval = getStrikeInterval(symbol.toUpperCase());
      const lotSize = getLotSize(symbol.toUpperCase());

      // Find ATM strike
      const atmStrike = chain.rows.reduce((closest, row) =>
        Math.abs(row.strikePrice - spot) < Math.abs(closest.strikePrice - spot) ? row : closest
      ).strikePrice;

      // Build premium map from actual market prices
      const premiums = new Map<string, number>();
      for (const row of chain.rows) {
        if (row.CE) premiums.set(`${row.strikePrice}-CE`, row.CE.lastPrice);
        if (row.PE) premiums.set(`${row.strikePrice}-PE`, row.PE.lastPrice);
      }

      const params = {
        spotPrice: spot,
        atmStrike,
        strikeInterval,
        expiry: chain.expiryDates[0] ?? '',
        premiums,
        otmOffset: otm_offset,
      };

      const template = STRATEGIES[strategy_name];
      if (!template) {
        return {
          content: [{ type: 'text' as const, text: `Unknown strategy "${strategy_name}". Use list_strategies to see available strategies.` }],
        };
      }

      const legs = buildStrategy(strategy_name, params);

      // Calculate payoff — map strategy legs to payoff legs (add expiry field)
      const payoffLegs = legs.map(l => ({
        type: l.type,
        strike: l.strike,
        premium: l.premium,
        qty: l.qty,
        action: l.action,
        expiry: l.expiry,
      }));

      const payoff = calculatePayoffAtExpiry(
        payoffLegs,
        { min: spot * 0.85, max: spot * 1.15, steps: 100 },
        lotSize
      );

      // Net premium
      let netPremium = 0;
      for (const l of legs) {
        if (l.action === 'SELL') netPremium += l.premium * l.qty;
        else netPremium -= l.premium * l.qty;
      }

      const isCredit = netPremium > 0;

      const lines = [
        `📋 ${template.displayName} — ${symbol.toUpperCase()}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `📊 Spot: ₹${formatNumber(spot)} | ATM: ${atmStrike} | Lot: ${lotSize}`,
        `📅 Expiry: ${chain.expiryDates[0]}`,
        `🎯 Outlook: ${template.outlook}`,
        `⚠️ Risk Level: ${template.riskLevel}`,
        '',
        '📐 Legs:',
        ...legs.map(l => `  ${l.action === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${l.qty}x ${l.type} ${l.strike} @ ₹${l.premium.toFixed(2)}`),
        '',
        `💰 Net Premium: ${isCredit ? '🟢 Credit' : '🔴 Debit'} ₹${Math.abs(netPremium).toFixed(2)} per share`,
        `   Per Lot: ${formatCurrency(Math.abs(netPremium) * lotSize)}`,
        '',
        `📈 Max Profit: ${payoff.maxProfit === Infinity ? 'Unlimited' : formatCurrency(payoff.maxProfit)}`,
        `📉 Max Loss:   ${payoff.maxLoss === -Infinity ? 'Unlimited' : formatCurrency(payoff.maxLoss)}`,
        `⚖️ Risk/Reward: ${riskRewardRatio(payoff.maxProfit, Math.abs(payoff.maxLoss)).toFixed(2)}`,
        `📍 Breakevens:  ${payoff.breakevens.map(b => '₹' + formatNumber(b, 0)).join(', ') || 'N/A'}`,
        '',
        `ℹ️ ${template.description}`,
        `📖 Max Profit: ${template.maxProfit}`,
        `📖 Max Loss: ${template.maxLoss}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'custom_strategy',
    'Build a custom multi-leg options strategy with specific strikes and actions.',
    {
      symbol: z.string().describe('Underlying symbol'),
      legs: z.array(z.object({
        type: z.enum(['CE', 'PE']),
        strike: z.number(),
        action: z.enum(['BUY', 'SELL']),
        qty: z.number().default(1),
      })).describe('Array of strategy legs'),
      expiry: z.string().optional(),
    },
    async ({ symbol, legs, expiry }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const spot = chain.underlyingValue;
      const lotSize = getLotSize(symbol.toUpperCase());

      // Get real premiums from market data
      const fullLegs = legs.map(l => {
        const row = chain.rows.find(r => r.strikePrice === l.strike);
        const premium = l.type === 'CE'
          ? row?.CE?.lastPrice ?? 0
          : row?.PE?.lastPrice ?? 0;
        return { ...l, premium, expiry: chain.expiryDates[0] ?? '' };
      });

      const payoff = calculatePayoffAtExpiry(
        fullLegs,
        { min: spot * 0.85, max: spot * 1.15, steps: 100 },
        lotSize
      );

      let netPremium = 0;
      for (const l of fullLegs) {
        netPremium += (l.action === 'SELL' ? 1 : -1) * l.premium * l.qty;
      }

      const lines = [
        `📋 Custom Strategy — ${symbol.toUpperCase()}`,
        `Spot: ₹${formatNumber(spot)} | Lot: ${lotSize}`,
        '',
        ...fullLegs.map(l => `  ${l.action === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${l.qty}x ${l.type} ${l.strike} @ ₹${l.premium.toFixed(2)}`),
        '',
        `Net: ${netPremium > 0 ? 'Credit' : 'Debit'} ₹${Math.abs(netPremium).toFixed(2)}/share (₹${formatNumber(Math.abs(netPremium) * lotSize)} per lot)`,
        `Max Profit: ${payoff.maxProfit === Infinity ? 'Unlimited' : formatCurrency(payoff.maxProfit)}`,
        `Max Loss: ${payoff.maxLoss === -Infinity ? 'Unlimited' : formatCurrency(payoff.maxLoss)}`,
        `Breakevens: ${payoff.breakevens.map(b => '₹' + formatNumber(b, 0)).join(', ') || 'N/A'}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'suggest_strategy',
    'Get AI-friendly strategy suggestions based on your market outlook, risk preference, and capital.',
    {
      outlook: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL', 'VOLATILE']).describe('Your market view'),
      risk_level: z.enum(['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH']).optional().describe('Maximum acceptable risk level'),
    },
    async ({ outlook, risk_level }) => {
      const suggestions = suggestStrategies(outlook, risk_level);

      const lines = [
        `💡 Strategy Suggestions for ${outlook} outlook${risk_level ? ` (max risk: ${risk_level})` : ''}:`,
        '',
        ...suggestions.map((s, i) => [
          `${i + 1}. ${s.displayName} [${s.riskLevel}]`,
          `   ${s.description}`,
          `   📊 ${s.outlook}`,
          `   Max Profit: ${s.maxProfit} | Max Loss: ${s.maxLoss}`,
          `   Use: build_strategy with strategy_name="${s.name}"`,
          '',
        ].join('\n')),
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'list_strategies',
    'List all available pre-built options strategies, optionally filtered by category.',
    {
      category: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL', 'VOLATILITY']).optional(),
    },
    async ({ category }) => {
      const strategies = listStrategies(category);

      const lines = [
        `📚 Available Strategies${category ? ` (${category})` : ''}:`,
        '',
        ...strategies.map(s =>
          `  • ${s.name.padEnd(28)} ${s.displayName.padEnd(28)} [${s.riskLevel.padEnd(9)}] ${s.legCount} legs`
        ),
        '',
        'Use build_strategy with the strategy name to build it with real market prices.',
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'calculate_payoff',
    'Calculate the payoff/P&L at expiry for given option legs at various underlying prices.',
    {
      legs: z.array(z.object({
        type: z.enum(['CE', 'PE']),
        strike: z.number(),
        premium: z.number(),
        qty: z.number().default(1),
        action: z.enum(['BUY', 'SELL']),
      })),
      spot_price: z.number().describe('Current spot price for range calculation'),
      lot_size: z.number().describe('Lot size'),
    },
    async ({ legs, spot_price, lot_size }) => {
      // Add expiry field required by the payoff engine
      const legsWithExpiry = legs.map(l => ({ ...l, expiry: '' }));
      const payoff = calculatePayoffAtExpiry(
        legsWithExpiry,
        { min: spot_price * 0.85, max: spot_price * 1.15, steps: 50 },
        lot_size
      );

      const lines = [
        `📊 Payoff Analysis (per lot of ${lot_size})`,
        `Max Profit: ${payoff.maxProfit === Infinity ? 'Unlimited' : formatCurrency(payoff.maxProfit)}`,
        `Max Loss: ${payoff.maxLoss === -Infinity ? 'Unlimited' : formatCurrency(payoff.maxLoss)}`,
        `Breakevens: ${payoff.breakevens.map(b => '₹' + formatNumber(b, 0)).join(', ')}`,
        '',
        'Price     │ P&L',
        '──────────┼──────────',
        ...payoff.data
          .filter((_, i) => i % 3 === 0) // show every 3rd point
          .map(p => `₹${formatNumber(p.underlyingPrice, 0).padStart(8)} │ ${p.pnl >= 0 ? '+' : ''}${formatCurrency(p.pnl)}`),
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // OI ANALYSIS TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'calculate_max_pain',
    'Calculate the Max Pain strike price — the price at which option buyers lose the most money.',
    {
      symbol: z.string().describe('Symbol, e.g. NIFTY'),
      expiry: z.string().optional(),
    },
    async ({ symbol, expiry }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const lotSize = getLotSize(symbol.toUpperCase());

      const oiData = chain.rows
        .filter(r => r.CE || r.PE)
        .map(r => ({
          strike: r.strikePrice,
          callOI: r.CE?.openInterest ?? 0,
          putOI: r.PE?.openInterest ?? 0,
        }));

      const result = calculateMaxPain(oiData, lotSize);

      const lines = [
        `🎯 Max Pain Analysis — ${symbol.toUpperCase()}`,
        `Spot: ₹${formatNumber(chain.underlyingValue)} | Expiry: ${chain.expiryDates[0]}`,
        '',
        `🎯 Max Pain Strike: ₹${result.maxPainStrike}`,
        `   Distance from Spot: ${formatPercent(((result.maxPainStrike - chain.underlyingValue) / chain.underlyingValue) * 100)}`,
        '',
        'Top 5 pain levels:',
        ...result.painByStrike
          .sort((a, b) => a.totalPain - b.totalPain)
          .slice(0, 5)
          .map((p, i) => `  ${i + 1}. ₹${p.strike} — Total Pain: ${formatLargeNumber(p.totalPain)}`),
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'get_pcr',
    'Calculate Put-Call Ratio (PCR) based on Open Interest, Volume, and OI Change.',
    {
      symbol: z.string().describe('Symbol'),
      expiry: z.string().optional(),
    },
    async ({ symbol, expiry }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);

      const oiData = chain.rows
        .filter(r => r.CE || r.PE)
        .map(r => ({
          strike: r.strikePrice,
          callOI: r.CE?.openInterest ?? 0,
          putOI: r.PE?.openInterest ?? 0,
          callVolume: r.CE?.totalTradedVolume ?? 0,
          putVolume: r.PE?.totalTradedVolume ?? 0,
          callOIChange: r.CE?.changeinOpenInterest ?? 0,
          putOIChange: r.PE?.changeinOpenInterest ?? 0,
        }));

      const pcr = calculatePCR(oiData);

      const lines = [
        `📊 Put-Call Ratio — ${symbol.toUpperCase()}`,
        `Expiry: ${chain.expiryDates[0]}`,
        '',
        `  OI PCR:     ${pcr.oiPCR.toFixed(3)}`,
        `  Volume PCR: ${pcr.volumePCR.toFixed(3)}`,
        `  Change PCR: ${pcr.changePCR?.toFixed(3) ?? 'N/A'}`,
        '',
        `  📍 Interpretation: ${pcr.interpretation}`,
        '',
        `  PCR > 1.0 → Excessive put writing → Contrarian BULLISH`,
        `  PCR < 0.7 → Excessive call writing → Contrarian BEARISH`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'highest_oi_strikes',
    'Find strikes with highest Open Interest — these act as support (Put OI) and resistance (Call OI) levels.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
      top_n: z.number().optional().describe('Number of top strikes to show (default: 5)'),
    },
    async ({ symbol, expiry, top_n }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const n = top_n ?? 5;

      const oiData = chain.rows.map(r => ({
        strike: r.strikePrice,
        callOI: r.CE?.openInterest ?? 0,
        putOI: r.PE?.openInterest ?? 0,
        callOIChange: r.CE?.changeinOpenInterest,
        putOIChange: r.PE?.changeinOpenInterest,
      }));

      const analysis = analyzeOIDistribution(oiData);

      const lines = [
        `🏔️ OI-Based Support & Resistance — ${symbol.toUpperCase()}`,
        `Spot: ₹${formatNumber(chain.underlyingValue)}`,
        '',
        `🔴 RESISTANCE (Highest Call OI — Sellers defending):`,
        ...analysis.topCallOIStrikes.slice(0, n).map((s, i) =>
          `  ${i + 1}. ₹${s.strike} — OI: ${formatOI(s.oi)}`
        ),
        '',
        `🟢 SUPPORT (Highest Put OI — Sellers defending):`,
        ...analysis.topPutOIStrikes.slice(0, n).map((s, i) =>
          `  ${i + 1}. ₹${s.strike} — OI: ${formatOI(s.oi)}`
        ),
        '',
        `📊 ${analysis.summary}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'oi_change_analysis',
    'Analyze Change in Open Interest across strikes to identify emerging support/resistance and market sentiment.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
    },
    async ({ symbol, expiry }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);

      const oiData = chain.rows
        .filter(r => (r.CE?.changeinOpenInterest ?? 0) !== 0 || (r.PE?.changeinOpenInterest ?? 0) !== 0)
        .map(r => ({
          strike: r.strikePrice,
          callOI: r.CE?.openInterest ?? 0,
          putOI: r.PE?.openInterest ?? 0,
          callOIChange: r.CE?.changeinOpenInterest ?? 0,
          putOIChange: r.PE?.changeinOpenInterest ?? 0,
        }));

      const analysis = analyzeOIDistribution(oiData);

      const lines = [
        `📈 OI Change Analysis — ${symbol.toUpperCase()}`,
        '',
        `🔴 Highest Call OI Increase (Emerging Resistance): ₹${analysis.highestCallOIChange.strike} (+${formatOI(analysis.highestCallOIChange.change)})`,
        `🟢 Highest Put OI Increase (Emerging Support): ₹${analysis.highestPutOIChange.strike} (+${formatOI(analysis.highestPutOIChange.change)})`,
        '',
        `📊 ${analysis.summary}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // IV ANALYTICS TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'iv_smile',
    'Get the IV Smile — Implied Volatility across different strike prices for a single expiry.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
    },
    async ({ symbol, expiry }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const spot = chain.underlyingValue;

      const smileData = chain.rows
        .filter(r => (r.CE?.impliedVolatility && r.CE.impliedVolatility > 0) || (r.PE?.impliedVolatility && r.PE.impliedVolatility > 0))
        .map(r => ({
          strike: r.strikePrice,
          callIV: r.CE?.impliedVolatility ? r.CE.impliedVolatility : null,
          putIV: r.PE?.impliedVolatility ? r.PE.impliedVolatility : null,
        }));

      const smile = calculateIVSmile(smileData, spot);
      const skew = calculateIVSkew(smileData, spot);

      const lines = [
        `📈 IV Smile — ${symbol.toUpperCase()} (Spot: ₹${formatNumber(spot)})`,
        '',
        'Strike    │ Moneyness │ Call IV │ Put IV │ Avg IV',
        '──────────┼───────────┼─────────┼────────┼────────',
        ...smile
          .filter(p => Math.abs(p.moneyness - 1) < 0.1) // Show strikes within 10% of ATM
          .map(p =>
            `${('₹' + p.strike).padStart(9)} │ ${p.moneyness.toFixed(3).padStart(9)} │ ${(p.callIV?.toFixed(1) ?? '-').padStart(7)} │ ${(p.putIV?.toFixed(1) ?? '-').padStart(6)} │ ${(p.avgIV?.toFixed(1) ?? '-').padStart(6)}`
          ),
        '',
        `📐 IV Skew: ${skew.skew.toFixed(4)}`,
        `   ${skew.description}`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'expected_move',
    'Calculate the Expected Move — the price range the market expects the underlying to stay within by expiry.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
      confidence: z.number().optional().describe('Sigma multiplier: 1=68%, 1.645=90%, 1.96=95% (default: 1)'),
    },
    async ({ symbol, expiry: expiryInput, confidence }) => {
      const chain = await getChain(symbol.toUpperCase(), expiryInput);
      const spot = chain.underlyingValue;

      // Get ATM IV
      const atmRow = chain.rows.reduce((closest, r) =>
        Math.abs(r.strikePrice - spot) < Math.abs(closest.strikePrice - spot) ? r : closest
      );
      const atmIV = ((atmRow.CE?.impliedVolatility ?? 0) + (atmRow.PE?.impliedVolatility ?? 0)) / 2 / 100; // convert % to decimal
      const dte = daysToExpiry(chain.expiryDates[0] ?? new Date().toISOString());

      const move = expectedMove(spot, atmIV, dte, confidence ?? 1);

      const confLabel = confidence === 1.96 ? '95%' : confidence === 1.645 ? '90%' : '68%';

      const lines = [
        `📏 Expected Move — ${symbol.toUpperCase()}`,
        `Spot: ₹${formatNumber(spot)} | ATM IV: ${(atmIV * 100).toFixed(1)}% | DTE: ${dte}`,
        '',
        `At ${confidence ?? 1}σ (${confLabel} probability):`,
        `  📈 Upper Range: ₹${formatNumber(move.upper)}`,
        `  📉 Lower Range: ₹${formatNumber(move.lower)}`,
        `  📏 Total Range:  ₹${formatNumber(move.range)} (${formatPercent(move.movePercent)})`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // MARKET DATA TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'market_overview',
    'Get a comprehensive overview of Indian market indices — NIFTY, BANKNIFTY with current values and key options data.',
    {},
    async () => {
      const results: string[] = ['📊 Indian Market Overview', ''];

      for (const idx of ['NIFTY', 'BANKNIFTY']) {
        try {
          const chain = await getChain(idx);
          const spot = chain.underlyingValue;
          const lotSize = getLotSize(idx);

          // ATM data
          const atmRow = chain.rows.reduce((closest, r) =>
            Math.abs(r.strikePrice - spot) < Math.abs(closest.strikePrice - spot) ? r : closest
          );
          const atmIV = ((atmRow.CE?.impliedVolatility ?? 0) + (atmRow.PE?.impliedVolatility ?? 0)) / 2;

          // PCR
          const totalCallOI = chain.rows.reduce((s, r) => s + (r.CE?.openInterest ?? 0), 0);
          const totalPutOI = chain.rows.reduce((s, r) => s + (r.PE?.openInterest ?? 0), 0);
          const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

          results.push(
            `${idx}: ₹${formatNumber(spot)} | ATM IV: ${(atmIV * 100).toFixed(1)}% | PCR: ${pcr.toFixed(3)} | Lot: ${lotSize}`,
          );
        } catch {
          results.push(`${idx}: Data unavailable`);
        }
      }

      const status = getMarketStatusInfo();
      results.push('', `🕐 ${status.message}`);

      return { content: [{ type: 'text' as const, text: results.join('\n') }] };
    }
  );

  server.tool(
    'market_status',
    'Check if the Indian stock market (NSE) is currently open or closed. Returns market status with trading hours info. Use before placing trades or to explain why data may be stale. Accounts for weekends and Indian market holidays.',
    {},
    async () => {
      const status = getMarketStatusInfo();
      return {
        content: [{ type: 'text' as const, text: `${status.isOpen ? '🟢' : '🔴'} ${status.message}` }],
      };
    }
  );

  server.tool(
    'lot_size',
    'Get the F&O lot size (number of shares per contract) for any NSE stock or index. Essential for calculating strategy costs, margin, and position sizing. Returns the current lot size as defined by NSE.',
    {
      symbol: z.string().describe('NSE F&O symbol, e.g. NIFTY (75), BANKNIFTY (30), RELIANCE, TATASTEEL'),
    },
    async ({ symbol }) => {
      const size = getLotSize(symbol.toUpperCase());
      return {
        content: [{ type: 'text' as const, text: `Lot size for ${symbol.toUpperCase()}: ${size} shares per lot` }],
      };
    }
  );

  server.tool(
    'next_expiry',
    'Get the next upcoming F&O expiry date for an Indian stock or index. Supports both weekly (index) and monthly expiries. Use to determine time-to-expiry for Greeks calculations or strategy timing.',
    {
      symbol: z.string().describe('NSE F&O symbol, e.g. NIFTY, BANKNIFTY, RELIANCE'),
      weekly: z.boolean().optional().describe('If true, get weekly expiry (only indices have weekly)'),
    },
    async ({ symbol, weekly }) => {
      const expiry = getNextExpiry(symbol.toUpperCase(), weekly ?? false);
      return {
        content: [{ type: 'text' as const, text: `Next expiry for ${symbol.toUpperCase()}: ${expiry.toDateString()}` }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════
  // RISK MANAGEMENT TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'estimate_margin',
    'Estimate the margin required for an options strategy (SPAN + Exposure margin).',
    {
      symbol: z.string(),
      legs: z.array(z.object({
        type: z.enum(['CE', 'PE']),
        strike: z.number(),
        premium: z.number(),
        qty: z.number().default(1),
        action: z.enum(['BUY', 'SELL']),
      })),
    },
    async ({ symbol, legs }) => {
      const chain = await getChain(symbol.toUpperCase());
      const spot = chain.underlyingValue;
      const lotSize = getLotSize(symbol.toUpperCase());

      const margin = estimateMargin(legs, spot, lotSize);

      const lines = [
        `💰 Margin Estimate — ${symbol.toUpperCase()}`,
        `Spot: ₹${formatNumber(spot)} | Lot: ${lotSize}`,
        '',
        `  SPAN Margin:     ${formatCurrency(margin.spanMargin)}`,
        `  Exposure Margin: ${formatCurrency(margin.exposureMargin)}`,
        `  Total Margin:    ${formatCurrency(margin.totalMargin)}`,
        margin.premiumReceived > 0 ? `  Premium Received: ${formatCurrency(margin.premiumReceived)}` : '',
        margin.marginBenefit > 0 ? `  Hedge Benefit:    ${formatCurrency(margin.marginBenefit)}` : '',
        '',
        '⚠️ Note: This is an estimate. Actual margins are calculated by the exchange using SPAN.',
      ].filter(Boolean);

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'probability_of_profit',
    'Calculate the Probability of Profit (POP) for an options strategy using log-normal distribution.',
    {
      breakevens: z.array(z.number()).describe('Breakeven price(s) of the strategy'),
      spot_price: z.number(),
      iv: z.number().describe('IV as percentage'),
      days_to_expiry: z.number(),
      strategy_type: z.enum(['CREDIT', 'DEBIT']),
    },
    async ({ breakevens, spot_price, iv, days_to_expiry, strategy_type }) => {
      const pop = probabilityOfProfit(breakevens, spot_price, iv / 100, days_to_expiry, strategy_type);

      return {
        content: [{ type: 'text' as const, text: `Probability of Profit: ${(pop * 100).toFixed(1)}%\n(${strategy_type} strategy, ${days_to_expiry} DTE, IV: ${iv}%)` }],
      };
    }
  );

  server.tool(
    'position_sizing',
    'Calculate optimal position size based on capital and risk tolerance.',
    {
      capital: z.number().describe('Total trading capital in ₹'),
      risk_percent: z.number().describe('Max % of capital to risk per trade (e.g. 2)'),
      max_loss_per_lot: z.number().describe('Maximum loss per lot for the strategy in ₹'),
      lot_size: z.number().describe('Lot size of the instrument'),
    },
    async ({ capital, risk_percent, max_loss_per_lot, lot_size }) => {
      const result = optimalPositionSize(capital, risk_percent, max_loss_per_lot, lot_size);

      const lines = [
        `📐 Position Sizing (${risk_percent}% risk rule)`,
        `  Capital: ${formatCurrency(capital)}`,
        `  Max Risk: ${formatCurrency(capital * risk_percent / 100)}`,
        `  Max Loss/Lot: ${formatCurrency(max_loss_per_lot * lot_size)}`,
        '',
        `  ✅ Recommended: ${result.lots} lot(s)`,
        `  Total Risk: ${formatCurrency(result.totalRisk)} (${result.capitalUsedPercent.toFixed(1)}% of capital)`,
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // SCANNER TOOLS
  // ════════════════════════════════════════════════════════════

  server.tool(
    'scan_high_oi',
    'Find strikes with the highest Open Interest buildup — indicates significant institutional positioning.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
      min_oi: z.number().optional().describe('Minimum OI threshold'),
    },
    async ({ symbol, expiry, min_oi }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const threshold = min_oi ?? 0;

      const callOI = chain.rows
        .filter(r => (r.CE?.openInterest ?? 0) > threshold)
        .sort((a, b) => (b.CE?.openInterest ?? 0) - (a.CE?.openInterest ?? 0))
        .slice(0, 10);

      const putOI = chain.rows
        .filter(r => (r.PE?.openInterest ?? 0) > threshold)
        .sort((a, b) => (b.PE?.openInterest ?? 0) - (a.PE?.openInterest ?? 0))
        .slice(0, 10);

      const lines = [
        `🔍 High OI Scanner — ${symbol.toUpperCase()}`,
        '',
        '📞 Top Call OI:',
        ...callOI.map(r => `  ₹${r.strikePrice} — OI: ${formatOI(r.CE!.openInterest)} | LTP: ₹${r.CE!.lastPrice.toFixed(2)}`),
        '',
        '📱 Top Put OI:',
        ...putOI.map(r => `  ₹${r.strikePrice} — OI: ${formatOI(r.PE!.openInterest)} | LTP: ₹${r.PE!.lastPrice.toFixed(2)}`),
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'unusual_activity',
    'Detect unusual options activity — strikes with abnormally high volume relative to open interest.',
    {
      symbol: z.string(),
      expiry: z.string().optional(),
      threshold: z.number().optional().describe('Volume/OI ratio threshold (default: 0.5)'),
    },
    async ({ symbol, expiry, threshold: thresh }) => {
      const chain = await getChain(symbol.toUpperCase(), expiry);
      const threshold = thresh ?? 0.5;

      const unusual: string[] = [];

      for (const row of chain.rows) {
        if (row.CE && row.CE.openInterest > 0) {
          const ratio = row.CE.totalTradedVolume / row.CE.openInterest;
          if (ratio > threshold) {
            unusual.push(`🟡 CE ${row.strikePrice}: Vol/OI = ${ratio.toFixed(2)} (Vol: ${formatOI(row.CE.totalTradedVolume)}, OI: ${formatOI(row.CE.openInterest)})`);
          }
        }
        if (row.PE && row.PE.openInterest > 0) {
          const ratio = row.PE.totalTradedVolume / row.PE.openInterest;
          if (ratio > threshold) {
            unusual.push(`🟡 PE ${row.strikePrice}: Vol/OI = ${ratio.toFixed(2)} (Vol: ${formatOI(row.PE.totalTradedVolume)}, OI: ${formatOI(row.PE.openInterest)})`);
          }
        }
      }

      unusual.sort().reverse();

      const lines = [
        `⚡ Unusual Activity Scanner — ${symbol.toUpperCase()} (threshold: ${threshold})`,
        '',
        unusual.length > 0
          ? unusual.slice(0, 20).join('\n')
          : 'No unusual activity detected at current threshold.',
      ];

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  // ════════════════════════════════════════════════════════════
  // MCP RESOURCES
  // ════════════════════════════════════════════════════════════

  server.resource(
    'market-status',
    'market://status',
    async () => {
      const status = getMarketStatusInfo();
      return {
        contents: [{
          uri: 'market://status',
          text: JSON.stringify({ ...status, timestamp: new Date().toISOString() }),
        }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════
  // MCP PROMPTS
  // ════════════════════════════════════════════════════════════

  server.prompt(
    'strategy_advisor',
    'Get a personalized options strategy recommendation based on market data and your outlook.',
    {
      symbol: z.string().describe('Symbol to analyze'),
      outlook: z.enum(['bullish', 'bearish', 'neutral', 'volatile']).describe('Your market view'),
      capital: z.string().optional().describe('Available capital in ₹'),
    },
    ({ symbol, outlook, capital }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: [
            `I need an options strategy recommendation for ${symbol.toUpperCase()}.`,
            `My outlook is ${outlook}.`,
            capital ? `My available capital is ₹${capital}.` : '',
            '',
            'Please:',
            '1. First get the option chain and spot price using get_option_chain',
            '2. Check PCR and Max Pain using get_pcr and calculate_max_pain',
            '3. Look at the expected move using expected_move',
            '4. Suggest strategies using suggest_strategy',
            '5. Build the best strategy using build_strategy',
            '6. Show the payoff analysis and risk metrics',
            '7. Recommend position sizing if capital is provided',
          ].filter(Boolean).join('\n'),
        },
      }],
    })
  );

  server.prompt(
    'market_analysis',
    'Get a comprehensive market analysis for an Indian F&O symbol.',
    {
      symbol: z.string().describe('Symbol to analyze'),
    },
    ({ symbol }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: [
            `Give me a comprehensive options analysis for ${symbol.toUpperCase()}.`,
            '',
            'Please analyze:',
            '1. Current spot price and market status (market_overview)',
            '2. Option chain with Greeks (get_option_chain)',
            '3. Support and resistance from OI (highest_oi_strikes)',
            '4. Put-Call Ratio sentiment (get_pcr)',
            '5. Max Pain level (calculate_max_pain)',
            '6. Expected move range (expected_move)',
            '7. IV Smile and skew (iv_smile)',
            '8. OI change patterns (oi_change_analysis)',
            '',
            'Synthesize all data into a clear market view with actionable insights.',
          ].join('\n'),
        },
      }],
    })
  );

  return server;
}
