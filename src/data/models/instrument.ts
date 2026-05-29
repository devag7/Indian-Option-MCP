/**
 * @module data/models/instrument
 * @description Core types representing tradeable instruments on Indian exchanges.
 *
 * These types model the instrument master file that NSE publishes daily and
 * that Kite Connect exposes via its instruments endpoint.  They are the
 * foundation for every downstream query — option-chain lookups, strategy
 * construction, and Greeks computation all reference instruments by these types.
 */

// ---------------------------------------------------------------------------
// Enums / Literal Unions
// ---------------------------------------------------------------------------

/**
 * Option type — Call or Put.
 *
 * NSE convention uses two-letter suffixes: `"CE"` for European-style calls,
 * `"PE"` for European-style puts.  Indian equity options are exclusively
 * European-style.
 */
export type OptionType = 'CE' | 'PE';

/**
 * Broad instrument classification used in the NSE / Kite instrument master.
 *
 * | Value  | Meaning                        |
 * | ------ | ------------------------------ |
 * | `"EQ"` | Cash equity                    |
 * | `"FUT"`| Stock / index future           |
 * | `"CE"` | Call option (European)         |
 * | `"PE"` | Put option (European)          |
 */
export type InstrumentType = 'EQ' | 'FUT' | 'CE' | 'PE';

/**
 * Exchange segment.
 *
 * | Value   | Description                             |
 * | ------- | --------------------------------------- |
 * | `"NSE"` | National Stock Exchange — cash segment  |
 * | `"NFO"` | NSE Futures & Options segment           |
 * | `"BSE"` | Bombay Stock Exchange — cash segment    |
 * | `"MCX"` | Multi Commodity Exchange                |
 */
export type Exchange = 'NSE' | 'NFO' | 'BSE' | 'MCX';

/**
 * Trading segment — finer-grained than {@link Exchange}.
 *
 * Used internally by Kite Connect to differentiate between index derivatives,
 * stock derivatives, and currency derivatives within the same exchange.
 */
export type Segment =
  | 'NSE'
  | 'NFO-OPT'
  | 'NFO-FUT'
  | 'BSE'
  | 'MCX-OPT'
  | 'MCX-FUT'
  | 'INDICES';

// ---------------------------------------------------------------------------
// Main Instrument Type
// ---------------------------------------------------------------------------

/**
 * A tradeable instrument on an Indian exchange.
 *
 * This is the canonical representation used throughout the server.  For
 * derivatives (futures and options) the optional fields `expiry`, `strike`,
 * and `lotSize` are populated.
 *
 * @example
 * ```ts
 * const niftyCall: Instrument = {
 *   token: 12345678,
 *   symbol: 'NIFTY2560524500CE',
 *   tradingSymbol: 'NIFTY2560524500CE',
 *   name: 'NIFTY',
 *   exchange: 'NFO',
 *   type: 'CE',
 *   expiry: new Date('2025-06-05'),
 *   strike: 24500,
 *   lotSize: 75,
 *   segment: 'NFO-OPT',
 *   tickSize: 0.05,
 * };
 * ```
 */
export interface Instrument {
  /**
   * Exchange-assigned numeric instrument token.
   * Unique within an exchange but may overlap across exchanges.
   */
  token: number;

  /**
   * Fully-qualified exchange symbol.
   * For derivatives this encodes the underlying, expiry, strike, and type
   * (e.g. `"NIFTY2560524500CE"`).
   */
  symbol: string;

  /**
   * Human-readable trading symbol — usually identical to {@link symbol} but
   * can differ for BSE scrips.
   */
  tradingSymbol: string;

  /**
   * Underlying name for derivatives (e.g. `"NIFTY"`, `"RELIANCE"`) or the
   * equity scrip name for cash instruments.
   */
  name: string;

  /** The exchange this instrument is listed on. */
  exchange: Exchange;

  /** Instrument classification — equity, future, call, or put. */
  type: InstrumentType;

  /**
   * Contract expiry date — present only for derivatives (`FUT`, `CE`, `PE`).
   * Always midnight UTC of the expiry day.
   */
  expiry?: Date;

  /**
   * Strike price — present only for options (`CE`, `PE`).
   * Expressed as an absolute price in INR (e.g. `24500`).
   */
  strike?: number;

  /**
   * Market lot size (number of shares per lot).
   * For NIFTY options this would be 75, for BANKNIFTY 30, etc.
   */
  lotSize: number;

  /**
   * Fine-grained trading segment.
   * Helps distinguish index vs stock derivatives within NFO.
   */
  segment: Segment;

  /**
   * Minimum price movement in INR.
   * Equity tick is ₹0.05; options ticks vary by exchange.
   */
  tickSize?: number;
}

// ---------------------------------------------------------------------------
// Lookup Helpers
// ---------------------------------------------------------------------------

/**
 * A minimal filter used when searching the instrument master for specific
 * derivative contracts.
 *
 * @example
 * ```ts
 * const filter: InstrumentFilter = {
 *   name: 'NIFTY',
 *   type: 'CE',
 *   expiry: new Date('2025-06-05'),
 *   strike: 24500,
 * };
 * ```
 */
export interface InstrumentFilter {
  /** Underlying symbol (e.g. `"NIFTY"`, `"RELIANCE"`). */
  name?: string;

  /** Instrument type filter. */
  type?: InstrumentType;

  /** Exchange filter. */
  exchange?: Exchange;

  /** Exact expiry date to match. */
  expiry?: Date;

  /** Exact strike price to match. */
  strike?: number;
}
