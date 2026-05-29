/**
 * @module data/models/option-chain
 * @description Types for option chain data as returned by NSE India and the
 * Kite Connect API.
 *
 * An option chain is the central data structure for derivatives analysis.  It
 * contains a matrix of strikes × expiries with bid/ask prices, volumes, open
 * interest, implied volatility, and (when computed) Greeks.
 */

import type { OptionType } from './instrument.js';

// ---------------------------------------------------------------------------
// Greeks
// ---------------------------------------------------------------------------

/**
 * The full set of option sensitivities (Greeks) for a single contract.
 *
 * First-order Greeks (`delta`, `gamma`, `theta`, `vega`, `rho`) are always
 * present.  Higher-order Greeks (`charm`, `vanna`, `volga`) are optional
 * and computed only on demand because they require additional calibration.
 *
 * All values are expressed per-share (not per-lot).
 */
export interface GreeksData {
  /**
   * Rate of change of option price with respect to the underlying price.
   * Ranges from 0 → 1 for calls, 0 → −1 for puts.
   */
  delta: number;

  /**
   * Rate of change of delta with respect to the underlying price.
   * Always positive; peaks near ATM and near expiry.
   */
  gamma: number;

  /**
   * Rate of change of option price with respect to time (time decay).
   * Expressed as the daily loss in INR (negative for long positions).
   */
  theta: number;

  /**
   * Sensitivity of the option price to a 1-percentage-point change in
   * implied volatility.
   */
  vega: number;

  /**
   * Sensitivity of the option price to a 1-percentage-point change in the
   * risk-free interest rate.
   */
  rho: number;

  // -- Higher-order Greeks (optional) ------------------------------------

  /**
   * dDelta / dTime — measures how delta changes as time passes.
   * Useful for managing delta-hedged portfolios overnight.
   */
  charm?: number;

  /**
   * dDelta / dVol — cross-Greek linking delta and volatility.
   * Critical for understanding skew risk.
   */
  vanna?: number;

  /**
   * dVega / dVol — convexity of vega.
   * High volga contracts benefit from volatility-of-volatility.
   */
  volga?: number;
}

// ---------------------------------------------------------------------------
// Per-Strike Option Data
// ---------------------------------------------------------------------------

/**
 * Market data for a single option contract at a specific strike and type.
 *
 * This is the atomic unit of an option chain — one row in the CE or PE
 * column for a given strike.
 */
export interface OptionData {
  /** Strike price in INR. */
  strikePrice: number;

  /** Option type — Call (`CE`) or Put (`PE`). */
  type: OptionType;

  /** Expiry date string as returned by the exchange (e.g. `"05-Jun-2025"`). */
  expiryDate: string;

  // -- Pricing -----------------------------------------------------------

  /** Last traded price in INR. */
  ltp: number;

  /** Best bid (buy) price. */
  bidPrice: number;

  /** Best ask (sell / offer) price. */
  askPrice: number;

  /** Quantity available at the best bid. */
  bidQty: number;

  /** Quantity available at the best ask. */
  askQty: number;

  // -- Volume & OI ------------------------------------------------------

  /** Open interest — total number of outstanding contracts. */
  openInterest: number;

  /** Change in open interest since the previous trading day. */
  changeinOI: number;

  /** Total contracts traded today. */
  volume: number;

  // -- Derived / Computed ------------------------------------------------

  /** Implied volatility (annualised, as a decimal — e.g. 0.18 = 18 %). */
  iv: number;

  /** Absolute price change from previous close in INR. */
  change: number;

  /** Percentage price change from previous close. */
  pChange: number;

  /**
   * Computed Greeks for this contract.
   * May be `undefined` if Greeks have not yet been calculated.
   */
  greeks?: GreeksData;
}

// ---------------------------------------------------------------------------
// Option Chain Row (one strike, both sides)
// ---------------------------------------------------------------------------

/**
 * A single row in the option chain matrix — one strike price with
 * optional Call and Put data.
 *
 * Deep OTM strikes may have data for only one side, hence both fields
 * are optional.
 */
export interface OptionChainRow {
  /** The strike price this row represents. */
  strikePrice: number;

  /** Call-side data for this strike, if available. */
  CE?: OptionData;

  /** Put-side data for this strike, if available. */
  PE?: OptionData;

  /** The expiry date for this row's contracts (e.g. `"05-Jun-2025"`). */
  expiryDate: string;
}

// ---------------------------------------------------------------------------
// Full Option Chain Response
// ---------------------------------------------------------------------------

/**
 * Complete option chain for a single underlying symbol and (optionally)
 * a specific expiry date.
 *
 * This is the top-level data structure returned by both the NSE scraper
 * and the Kite Connect option-chain endpoint.
 *
 * @example
 * ```ts
 * const chain: OptionChainData = {
 *   symbol: 'NIFTY',
 *   spotPrice: 24350.55,
 *   expiryDates: ['05-Jun-2025', '12-Jun-2025', '26-Jun-2025'],
 *   data: [ ... ],
 *   timestamp: '2025-06-02T10:30:00+05:30',
 *   underlyingValue: 24350.55,
 * };
 * ```
 */
export interface OptionChainData {
  /** Underlying symbol (e.g. `"NIFTY"`, `"BANKNIFTY"`, `"RELIANCE"`). */
  symbol: string;

  /** Current spot / index price of the underlying in INR. */
  spotPrice: number;

  /**
   * All available expiry dates for this symbol, sorted chronologically.
   * Date strings are in the format returned by the exchange.
   */
  expiryDates: string[];

  /** Array of strike rows — the core option chain matrix. */
  data: OptionChainRow[];

  /**
   * Timestamp of the data snapshot, typically IST.
   * ISO-8601 string or exchange-native format.
   */
  timestamp: string;

  /**
   * Underlying value as reported by the exchange.
   * For index options this equals the index level; for stock options it
   * equals the cash-market LTP.
   */
  underlyingValue: number;
}

// ---------------------------------------------------------------------------
// Aggregated OI / Volume Summaries
// ---------------------------------------------------------------------------

/**
 * Aggregated open-interest summary across all strikes for a given expiry.
 *
 * Useful for quick put-call ratio (PCR) calculations and identifying
 * support / resistance zones based on OI build-up.
 */
export interface OISummary {
  /** Total call open interest across all strikes. */
  totalCallOI: number;

  /** Total put open interest across all strikes. */
  totalPutOI: number;

  /** Put-Call Ratio (PCR) by open interest: `totalPutOI / totalCallOI`. */
  pcrByOI: number;

  /** Total call volume across all strikes. */
  totalCallVolume: number;

  /** Total put volume across all strikes. */
  totalPutVolume: number;

  /** Put-Call Ratio by volume: `totalPutVolume / totalCallVolume`. */
  pcrByVolume: number;

  /** Strike with the highest call OI — commonly interpreted as resistance. */
  maxCallOIStrike: number;

  /** Strike with the highest put OI — commonly interpreted as support. */
  maxPutOIStrike: number;
}
