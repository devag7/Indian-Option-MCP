/**
 * @module data/models/strategy
 * @description Types for option strategy construction, analysis, and payoff
 * computation.
 *
 * This module defines the full lifecycle of a strategy:
 *
 * 1. **Definition** — the abstract blueprint (e.g. "Bull Call Spread").
 * 2. **Legs** — concrete contracts with real prices and quantities.
 * 3. **Result** — the analysed output: net premium, max P&L, breakevens,
 *    net Greeks, and probability of profit.
 * 4. **Payoff** — a dense array of (price, P&L) points for charting.
 */

import type { GreeksData } from './option-chain.js';
import type { OptionType } from './instrument.js';

// ---------------------------------------------------------------------------
// Strategy Leg
// ---------------------------------------------------------------------------

/**
 * Whether the trader is buying or selling this leg.
 */
export type LegAction = 'BUY' | 'SELL';

/**
 * The type of contract in a strategy leg.
 */
export type LegType = OptionType | 'FUT' | 'EQ';

/**
 * A single leg (contract) of a multi-leg option strategy.
 *
 * @example
 * ```ts
 * const longCall: StrategyLeg = {
 *   type: 'CE',
 *   strike: 24500,
 *   premium: 150.25,
 *   qty: 75,
 *   action: 'BUY',
 *   expiry: '05-Jun-2025',
 * };
 * ```
 */
export interface StrategyLeg {
  /** Contract type — Call, Put, Future, or Equity. */
  type: LegType;

  /**
   * Strike price in INR.
   * Required for options; ignored for futures / equity.
   */
  strike: number;

  /**
   * Premium (option price) or entry price (for futures/equity) per share
   * in INR.
   */
  premium: number;

  /**
   * Total quantity (number of shares, not lots).
   * Must be a multiple of the lot size.
   */
  qty: number;

  /** Whether this leg is being bought or sold. */
  action: LegAction;

  /** Expiry date string (e.g. `"05-Jun-2025"`). */
  expiry: string;

  /**
   * Full exchange trading symbol, if resolved.
   * Example: `"NIFTY2560524500CE"`.
   */
  instrumentSymbol?: string;

  /** Implied volatility of this leg at entry, if known. */
  iv?: number;

  /** Greeks at entry, if computed. */
  greeks?: GreeksData;
}

// ---------------------------------------------------------------------------
// Risk Level & Outlook
// ---------------------------------------------------------------------------

/**
 * Qualitative risk classification for a strategy.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'very-high';

/**
 * Market outlook the strategy is designed for.
 */
export type MarketOutlook =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'volatile'
  | 'range-bound';

/**
 * Broad strategy category.
 */
export type StrategyCategory =
  | 'directional'
  | 'income'
  | 'volatility'
  | 'hedging'
  | 'arbitrage';

// ---------------------------------------------------------------------------
// Strategy Definition (abstract blueprint)
// ---------------------------------------------------------------------------

/**
 * An abstract strategy template — describes the shape of a strategy
 * (number of legs, relative strikes) without binding to specific prices.
 *
 * @example
 * ```ts
 * const bullCallSpread: StrategyDefinition = {
 *   name: 'Bull Call Spread',
 *   category: 'directional',
 *   legs: [
 *     { type: 'CE', strike: 0, premium: 0, qty: 1, action: 'BUY',  expiry: '' },
 *     { type: 'CE', strike: 0, premium: 0, qty: 1, action: 'SELL', expiry: '' },
 *   ],
 *   description: 'Buy a lower-strike call and sell a higher-strike call ...',
 *   outlook: 'bullish',
 *   riskLevel: 'low',
 * };
 * ```
 */
export interface StrategyDefinition {
  /** Human-readable strategy name (e.g. `"Iron Condor"`). */
  name: string;

  /** Broad strategy classification. */
  category: StrategyCategory;

  /**
   * Template legs — strikes and premiums are placeholders (0) and will be
   * filled in when the strategy is instantiated with real market data.
   */
  legs: StrategyLeg[];

  /** Detailed description of how the strategy works. */
  description: string;

  /** What market view this strategy profits from. */
  outlook: MarketOutlook;

  /** Qualitative risk level. */
  riskLevel: RiskLevel;
}

// ---------------------------------------------------------------------------
// Strategy Result (analysed output)
// ---------------------------------------------------------------------------

/**
 * The fully analysed result of a constructed option strategy.
 *
 * This is the primary output returned to the MCP client.
 */
export interface StrategyResult {
  /** The strategy's name. */
  name: string;

  /** Underlying symbol (e.g. `"NIFTY"`). */
  symbol: string;

  /** Concrete legs with real prices. */
  legs: StrategyLeg[];

  // -- P&L Summary -------------------------------------------------------

  /**
   * Net premium received (+) or paid (−) for the entire strategy, in INR.
   * Positive means the trader collects premium (credit strategy).
   */
  netPremium: number;

  /**
   * Maximum possible profit in INR.
   * `Infinity` for strategies with unlimited upside.
   */
  maxProfit: number;

  /**
   * Maximum possible loss in INR (expressed as a positive number).
   * `Infinity` for strategies with unlimited risk.
   */
  maxLoss: number;

  /**
   * Breakeven underlying prices at expiry.
   * A single breakeven for simple spreads; two for straddles/strangles/condors.
   */
  breakevens: number[];

  /**
   * Risk-to-reward ratio — `maxLoss / maxProfit`.
   * Lower is better. `Infinity` if maxProfit is zero.
   */
  riskReward: number;

  // -- Greeks (net) ------------------------------------------------------

  /**
   * Aggregated Greeks across all legs of the strategy.
   * Reflects the combined sensitivity of the entire position.
   */
  netGreeks: GreeksData;

  // -- Probability -------------------------------------------------------

  /**
   * Estimated probability of profit at expiry (0–1).
   *
   * Computed from the implied-volatility-derived distribution.  This is an
   * estimate, not a guarantee.
   */
  pop: number;

  /**
   * Total margin requirement for the strategy in INR, if calculable.
   */
  marginRequired?: number;

  /** Human-readable summary of the strategy and its risk characteristics. */
  summary?: string;
}

// ---------------------------------------------------------------------------
// Payoff Diagram
// ---------------------------------------------------------------------------

/**
 * A single point on a strategy's expiry payoff curve.
 */
export interface PayoffPoint {
  /** Underlying price at expiry. */
  underlyingPrice: number;

  /** Profit or loss at this price (in INR). Negative = loss. */
  pnl: number;
}

/**
 * Complete payoff analysis for a strategy.
 *
 * Contains a dense array of points suitable for charting and the key
 * reference values (max profit, max loss, breakevens) already extracted.
 */
export interface PayoffResult {
  /**
   * Dense array of (price, pnl) points spanning a reasonable range
   * around the current spot price.  Typically 200+ points.
   */
  data: PayoffPoint[];

  /**
   * Maximum profit value from the payoff data.
   * `Infinity` for unlimited-profit strategies — in the data array the
   * largest computed value is used.
   */
  maxProfit: number;

  /**
   * Maximum loss value from the payoff data (positive number).
   * `Infinity` for unlimited-risk strategies.
   */
  maxLoss: number;

  /** Breakeven prices extracted from the payoff curve. */
  breakevens: number[];
}
