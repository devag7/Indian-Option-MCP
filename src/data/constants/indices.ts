/**
 * @module data/constants/indices
 * @description Metadata for NSE / BSE broad-market and sectoral indices.
 *
 * This module provides a canonical registry of the indices that have F&O
 * contracts or are commonly used as benchmarks for option analysis.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Comprehensive metadata for a market index.
 */
export interface IndexInfo {
  /** Canonical index symbol as used in NSE APIs (e.g. `"NIFTY 50"`). */
  symbol: string;

  /**
   * Short trading symbol used in the F&O segment.
   * This is what you pass to option-chain endpoints (e.g. `"NIFTY"`).
   */
  tradingSymbol: string;

  /** Human-readable display name. */
  name: string;

  /** Exchange where this index is published. */
  exchange: 'NSE' | 'BSE';

  /** Whether weekly F&O contracts are available (in addition to monthly). */
  hasWeeklyExpiry: boolean;

  /** Lot size for derivatives contracts. */
  lotSize: number;

  /**
   * Standard strike interval in INR for option contracts.
   * E.g. NIFTY has strikes every ₹50, BANKNIFTY every ₹100.
   */
  strikeInterval: number;

  /** Number of constituents in the index. */
  constituents: number;

  /** Brief description of the index. */
  description: string;

  /**
   * Day of week for weekly expiry (0 = Sunday, 6 = Saturday).
   * `undefined` if the index has no weekly expiry.
   */
  weeklyExpiryDay?: number;
}

// ---------------------------------------------------------------------------
// Index Registry
// ---------------------------------------------------------------------------

/**
 * All major NSE and BSE indices that are relevant for F&O trading.
 *
 * This list includes:
 * - Benchmark indices with F&O contracts (NIFTY, BANKNIFTY, etc.)
 * - Volatility index (India VIX) — no F&O but critical for pricing
 * - BSE indices with derivatives (SENSEX, BANKEX)
 */
export const INDICES: readonly IndexInfo[] = Object.freeze([
  {
    symbol: 'NIFTY 50',
    tradingSymbol: 'NIFTY',
    name: 'Nifty 50',
    exchange: 'NSE',
    hasWeeklyExpiry: true,
    lotSize: 75,
    strikeInterval: 50,
    constituents: 50,
    description:
      'The benchmark index of the National Stock Exchange, comprising the 50 ' +
      'largest and most liquid Indian companies by free-float market capitalisation.',
    weeklyExpiryDay: 4, // Thursday
  },
  {
    symbol: 'NIFTY BANK',
    tradingSymbol: 'BANKNIFTY',
    name: 'Nifty Bank',
    exchange: 'NSE',
    hasWeeklyExpiry: true,
    lotSize: 30,
    strikeInterval: 100,
    constituents: 12,
    description:
      'Tracks the performance of the most liquid and large-capitalised banking ' +
      'stocks listed on NSE. The most actively traded index option in India.',
    weeklyExpiryDay: 3, // Wednesday
  },
  {
    symbol: 'NIFTY FIN SERVICE',
    tradingSymbol: 'FINNIFTY',
    name: 'Nifty Financial Services',
    exchange: 'NSE',
    hasWeeklyExpiry: true,
    lotSize: 40,
    strikeInterval: 50,
    constituents: 20,
    description:
      'Covers banks, insurance companies, NBFCs, housing finance, and other ' +
      'financial services companies listed on NSE.',
    weeklyExpiryDay: 2, // Tuesday
  },
  {
    symbol: 'NIFTY MIDCAP SELECT',
    tradingSymbol: 'MIDCPNIFTY',
    name: 'Nifty Midcap Select',
    exchange: 'NSE',
    hasWeeklyExpiry: true,
    lotSize: 120,
    strikeInterval: 25,
    constituents: 25,
    description:
      'Represents the midcap segment of the Indian equity market, comprising ' +
      '25 stocks from the Nifty Midcap 150 index.',
    weeklyExpiryDay: 1, // Monday
  },
  {
    symbol: 'NIFTY NEXT 50',
    tradingSymbol: 'NIFTYNXT50',
    name: 'Nifty Next 50',
    exchange: 'NSE',
    hasWeeklyExpiry: false,
    lotSize: 25,
    strikeInterval: 100,
    constituents: 50,
    description:
      'Comprises the next 50 companies by free-float market cap after the Nifty 50. ' +
      'Often seen as a feeder index for the Nifty 50.',
  },
  {
    symbol: 'INDIA VIX',
    tradingSymbol: 'INDIAVIX',
    name: 'India VIX',
    exchange: 'NSE',
    hasWeeklyExpiry: false,
    lotSize: 0, // Not directly tradeable as F&O
    strikeInterval: 0,
    constituents: 0,
    description:
      'India Volatility Index — measures the market\'s expectation of 30-day ' +
      'volatility implied by NIFTY option prices. A VIX above 20 generally ' +
      'indicates elevated fear; below 13 indicates complacency.',
  },
  {
    symbol: 'SENSEX',
    tradingSymbol: 'SENSEX',
    name: 'S&P BSE Sensex',
    exchange: 'BSE',
    hasWeeklyExpiry: true,
    lotSize: 10,
    strikeInterval: 100,
    constituents: 30,
    description:
      'India\'s oldest and most widely tracked equity index, comprising 30 ' +
      'of the largest and most actively traded stocks on the Bombay Stock Exchange.',
    weeklyExpiryDay: 5, // Friday
  },
  {
    symbol: 'BANKEX',
    tradingSymbol: 'BANKEX',
    name: 'S&P BSE Bankex',
    exchange: 'BSE',
    hasWeeklyExpiry: false,
    lotSize: 15,
    strikeInterval: 100,
    constituents: 10,
    description:
      'BSE\'s banking sector index tracking the performance of the most ' +
      'liquid and large-cap banking stocks listed on BSE.',
  },
] as const);

// ---------------------------------------------------------------------------
// Lookup Helpers
// ---------------------------------------------------------------------------

/** Pre-built map for O(1) lookups by trading symbol. */
const _byTradingSymbol = new Map<string, IndexInfo>(
  INDICES.map((idx) => [idx.tradingSymbol.toUpperCase(), idx]),
);

/** Pre-built map for O(1) lookups by full symbol. */
const _bySymbol = new Map<string, IndexInfo>(
  INDICES.map((idx) => [idx.symbol.toUpperCase(), idx]),
);

/**
 * Look up index metadata by its F&O trading symbol.
 *
 * @param tradingSymbol - e.g. `"NIFTY"`, `"BANKNIFTY"`, `"FINNIFTY"`.
 * @returns The {@link IndexInfo} or `undefined` if not found.
 *
 * @example
 * ```ts
 * const info = getIndexByTradingSymbol('BANKNIFTY');
 * console.error(info?.lotSize); // 30
 * ```
 */
export function getIndexByTradingSymbol(
  tradingSymbol: string,
): IndexInfo | undefined {
  return _byTradingSymbol.get(tradingSymbol.toUpperCase().trim());
}

/**
 * Look up index metadata by its full NSE symbol.
 *
 * @param symbol - e.g. `"NIFTY 50"`, `"NIFTY BANK"`.
 * @returns The {@link IndexInfo} or `undefined` if not found.
 */
export function getIndexBySymbol(symbol: string): IndexInfo | undefined {
  return _bySymbol.get(symbol.toUpperCase().trim());
}

/**
 * Check whether a symbol represents a known index (as opposed to a stock).
 *
 * @param symbol - Trading symbol or full symbol (case-insensitive).
 * @returns `true` if the symbol corresponds to an index.
 */
export function isIndex(symbol: string): boolean {
  const upper = symbol.toUpperCase().trim();
  return _byTradingSymbol.has(upper) || _bySymbol.has(upper);
}

/**
 * Get all indices that have weekly F&O expiry contracts.
 *
 * @returns Array of {@link IndexInfo} objects.
 */
export function getWeeklyExpiryIndices(): IndexInfo[] {
  return INDICES.filter((idx) => idx.hasWeeklyExpiry);
}
