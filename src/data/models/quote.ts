/**
 * @module data/models/quote
 * @description Types for equity/index quotes, OHLC candles, and market status.
 *
 * These types are used by both the NSE scraper and the Kite Connect adapter
 * to return real-time and historical price data in a provider-agnostic shape.
 */

// ---------------------------------------------------------------------------
// Real-Time Quote
// ---------------------------------------------------------------------------

/**
 * A real-time price quote for an equity scrip, index, or derivative.
 *
 * @example
 * ```ts
 * const niftyQuote: QuoteData = {
 *   symbol: 'NIFTY 50',
 *   ltp: 24350.55,
 *   open: 24280.00,
 *   high: 24420.10,
 *   low: 24250.30,
 *   close: 24310.00,
 *   volume: 0,          // indices have no volume
 *   change: 40.55,
 *   pChange: 0.17,
 *   timestamp: '2025-06-02T10:30:00+05:30',
 * };
 * ```
 */
export interface QuoteData {
  /** Exchange symbol or index name. */
  symbol: string;

  /** Last traded price (or latest index value) in INR. */
  ltp: number;

  /** Day's opening price. */
  open: number;

  /** Day's highest price. */
  high: number;

  /** Day's lowest price. */
  low: number;

  /** Previous trading day's closing price. */
  close: number;

  /**
   * Total traded volume (number of shares).
   * For indices this is typically 0.
   */
  volume: number;

  /** Absolute change from previous close in INR. */
  change: number;

  /** Percentage change from previous close. */
  pChange: number;

  /** Timestamp of the quote snapshot (ISO-8601 or exchange format). */
  timestamp: string;

  // -- Optional enriched fields -----------------------------------------

  /** 52-week high price. */
  yearHigh?: number;

  /** 52-week low price. */
  yearLow?: number;

  /** Total traded value in INR (volume × average price). */
  totalTradedValue?: number;

  /** Total traded quantity (may differ from `volume` on BSE). */
  totalTradedVolume?: number;

  /** Upper circuit limit for the day. */
  upperCircuit?: number;

  /** Lower circuit limit for the day. */
  lowerCircuit?: number;
}

// ---------------------------------------------------------------------------
// OHLC (daily bar)
// ---------------------------------------------------------------------------

/**
 * A single OHLC bar — used for end-of-day or intra-day charting.
 */
export interface OHLCData {
  /** The date/time this bar represents. */
  date: string;

  /** Opening price. */
  open: number;

  /** Highest price during the period. */
  high: number;

  /** Lowest price during the period. */
  low: number;

  /** Closing price. */
  close: number;

  /** Total volume traded during this bar. */
  volume: number;
}

/**
 * Historical candle data — extends {@link OHLCData} with computed fields
 * that are useful for technical analysis.
 */
export interface CandleData extends OHLCData {
  /** Open interest at the close of this candle (derivatives only). */
  oi?: number;

  /**
   * The candle's timeframe / resolution.
   * `"1m"` | `"5m"` | `"15m"` | `"30m"` | `"60m"` | `"day"` | `"week"` | `"month"`
   */
  interval: CandleInterval;
}

/**
 * Supported candle / bar intervals.
 */
export type CandleInterval =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '60m'
  | 'day'
  | 'week'
  | 'month';

// ---------------------------------------------------------------------------
// Historical Data Request
// ---------------------------------------------------------------------------

/**
 * Parameters for requesting historical candle data from a provider.
 */
export interface HistoricalDataRequest {
  /** Instrument symbol or token. */
  symbol: string;

  /** Exchange the instrument belongs to. */
  exchange: string;

  /** Start of the date range (inclusive). */
  from: Date;

  /** End of the date range (inclusive). */
  to: Date;

  /** Desired candle resolution. */
  interval: CandleInterval;
}

// ---------------------------------------------------------------------------
// Market Status
// ---------------------------------------------------------------------------

/**
 * Overall market status for Indian exchanges.
 *
 * NSE publishes this via its `/marketStatus` endpoint.
 */
export interface MarketStatus {
  /**
   * Current status of the market.
   * `"Open"` during trading hours, `"Closed"` otherwise.
   * May also be `"Pre-Open"`, `"Post-Close"`, or `"Holiday"`.
   */
  status: 'Pre-Open' | 'Open' | 'Post-Close' | 'Closed' | 'Holiday';

  /** Human-readable status message from the exchange. */
  marketStatusMessage: string;

  /** The current trading date (IST, `YYYY-MM-DD`). */
  tradeDate: string;

  // -- Broad market index snapshot -------------------------------------

  /** NIFTY 50 index value, if available. */
  nifty50?: number;

  /** NIFTY BANK index value, if available. */
  niftyBank?: number;

  /** India VIX (volatility index), if available. */
  indiaVix?: number;

  /** Advance / decline / unchanged counts. */
  marketBreadth?: {
    advances: number;
    declines: number;
    unchanged: number;
  };
}

// ---------------------------------------------------------------------------
// Index Quote (enriched)
// ---------------------------------------------------------------------------

/**
 * Enriched quote for an NSE index — includes constituent advances/declines
 * and related index values.
 */
export interface IndexQuoteData extends QuoteData {
  /** Number of constituent stocks that advanced. */
  advances?: number;

  /** Number of constituent stocks that declined. */
  declines?: number;

  /** Number of constituent stocks unchanged. */
  unchanged?: number;

  /** India VIX value at the time of the quote. */
  indiaVix?: number;
}
