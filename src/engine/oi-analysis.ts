/**
 * @fileoverview Open Interest Analysis Engine
 *
 * Detects OI-based market signals (long buildup, short buildup, short covering,
 * long unwinding) and analyzes OI distribution across strikes to identify
 * support/resistance levels.
 *
 * Signal Detection Logic:
 * - Price ↑ + OI ↑ → LONG_BUILDUP (new longs entering, bullish)
 * - Price ↓ + OI ↑ → SHORT_BUILDUP (new shorts entering, bearish)
 * - Price ↑ + OI ↓ → SHORT_COVERING (shorts exiting, mildly bullish)
 * - Price ↓ + OI ↓ → LONG_UNWINDING (longs exiting, mildly bearish)
 *
 * @module engine/oi-analysis
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** OI activity signal classification */
export type OISignal =
  | 'LONG_BUILDUP'
  | 'SHORT_BUILDUP'
  | 'SHORT_COVERING'
  | 'LONG_UNWINDING';

/** Result of OI activity detection */
export interface OIActivityResult {
  /** Detected signal type */
  signal: OISignal;
  /** Human-readable description of the signal */
  description: string;
}

/** Input data for OI distribution analysis */
export interface OIStrikeData {
  /** Strike price */
  strike: number;
  /** Call open interest at this strike */
  callOI: number;
  /** Put open interest at this strike */
  putOI: number;
  /** Change in call OI (optional) */
  callOIChange?: number;
  /** Change in put OI (optional) */
  putOIChange?: number;
}

/** Strike + OI pair for top-N lists */
export interface StrikeOI {
  /** Strike price */
  strike: number;
  /** Open interest value */
  oi: number;
}

/** Strike + OI change pair */
export interface StrikeOIChange {
  /** Strike price */
  strike: number;
  /** OI change value */
  change: number;
}

/** Complete OI distribution analysis result */
export interface OIDistributionResult {
  /** Strike with highest call OI (resistance level) */
  highestCallOI: StrikeOI;
  /** Strike with highest put OI (support level) */
  highestPutOI: StrikeOI;
  /** Strike with highest positive call OI change (emerging resistance) */
  highestCallOIChange: StrikeOIChange;
  /** Strike with highest positive put OI change (emerging support) */
  highestPutOIChange: StrikeOIChange;
  /** Top 5 strikes by call OI */
  topCallOIStrikes: StrikeOI[];
  /** Top 5 strikes by put OI */
  topPutOIStrikes: StrikeOI[];
  /** Natural language summary of OI distribution */
  summary: string;
}

// ─── Signal Detection ────────────────────────────────────────────────────────

/**
 * Detect OI activity signal based on price and OI changes.
 *
 * Signal Matrix:
 * ┌───────────┬──────────┬────────────────────────────────────────────┐
 * │ Price     │ OI       │ Signal                                     │
 * ├───────────┼──────────┼────────────────────────────────────────────┤
 * │ ↑ (up)    │ ↑ (up)   │ LONG_BUILDUP — Fresh buying, bullish       │
 * │ ↓ (down)  │ ↑ (up)   │ SHORT_BUILDUP — Fresh selling, bearish     │
 * │ ↑ (up)    │ ↓ (down) │ SHORT_COVERING — Shorts exiting, bullish   │
 * │ ↓ (down)  │ ↓ (down) │ LONG_UNWINDING — Longs exiting, bearish    │
 * └───────────┴──────────┴────────────────────────────────────────────┘
 *
 * @param currentPrice - Current price of the underlying/option
 * @param previousPrice - Previous session's price
 * @param currentOI - Current open interest
 * @param previousOI - Previous session's open interest
 * @returns Signal classification and description
 *
 * @example
 * // NIFTY went up and OI increased → fresh buying
 * const result = detectOIActivity(24800, 24600, 12000000, 11500000);
 * // result.signal → 'LONG_BUILDUP'
 */
export function detectOIActivity(
  currentPrice: number,
  previousPrice: number,
  currentOI: number,
  previousOI: number
): OIActivityResult {
  const priceChange = currentPrice - previousPrice;
  const oiChange = currentOI - previousOI;

  const priceUp = priceChange >= 0;
  const oiUp = oiChange >= 0;

  const priceChangeAbs = Math.abs(priceChange);
  const oiChangeAbs = Math.abs(oiChange);
  const priceChangePct = previousPrice > 0 ? ((priceChange / previousPrice) * 100).toFixed(2) : '0.00';
  const oiChangePct = previousOI > 0 ? ((oiChange / previousOI) * 100).toFixed(2) : '0.00';

  if (priceUp && oiUp) {
    return {
      signal: 'LONG_BUILDUP',
      description:
        `Long Buildup: Price up ₹${priceChangeAbs.toFixed(2)} (${priceChangePct}%) ` +
        `with OI increase of ${oiChangeAbs.toLocaleString()} (${oiChangePct}%). ` +
        `Fresh buying interest — bullish signal.`,
    };
  }

  if (!priceUp && oiUp) {
    return {
      signal: 'SHORT_BUILDUP',
      description:
        `Short Buildup: Price down ₹${priceChangeAbs.toFixed(2)} (${priceChangePct}%) ` +
        `with OI increase of ${oiChangeAbs.toLocaleString()} (${oiChangePct}%). ` +
        `Fresh short positions — bearish signal.`,
    };
  }

  if (priceUp && !oiUp) {
    return {
      signal: 'SHORT_COVERING',
      description:
        `Short Covering: Price up ₹${priceChangeAbs.toFixed(2)} (${priceChangePct}%) ` +
        `with OI decrease of ${oiChangeAbs.toLocaleString()} (${oiChangePct}%). ` +
        `Shorts exiting positions — mildly bullish.`,
    };
  }

  // !priceUp && !oiUp
  return {
    signal: 'LONG_UNWINDING',
    description:
      `Long Unwinding: Price down ₹${priceChangeAbs.toFixed(2)} (${priceChangePct}%) ` +
      `with OI decrease of ${oiChangeAbs.toLocaleString()} (${oiChangePct}%). ` +
      `Longs exiting positions — mildly bearish.`,
  };
}

// ─── OI Distribution Analysis ────────────────────────────────────────────────

/** Number of top strikes to include in analysis */
const TOP_N = 5;

/**
 * Analyze OI distribution across an option chain to identify
 * key support/resistance levels and emerging trends.
 *
 * Analysis includes:
 * - **Highest Call OI**: Strike acting as resistance (call writers cap upside)
 * - **Highest Put OI**: Strike acting as support (put writers defend downside)
 * - **Highest Call OI Change**: Emerging resistance (fresh call writing)
 * - **Highest Put OI Change**: Emerging support (fresh put writing)
 * - **Top 5 Call/Put OI Strikes**: Full picture of support/resistance walls
 *
 * @param optionChainData - Array of strike-level OI data
 * @returns Comprehensive OI distribution analysis
 *
 * @example
 * const chain = [
 *   { strike: 24400, callOI: 1500000, putOI: 500000, callOIChange: 50000, putOIChange: 100000 },
 *   { strike: 24500, callOI: 2000000, putOI: 3000000, callOIChange: 200000, putOIChange: 500000 },
 *   { strike: 24600, callOI: 5000000, putOI: 2500000, callOIChange: 1000000, putOIChange: 50000 },
 * ];
 * const analysis = analyzeOIDistribution(chain);
 * // analysis.highestCallOI.strike → 24600 (resistance)
 * // analysis.highestPutOI.strike → 24500 (support)
 */
export function analyzeOIDistribution(
  optionChainData: OIStrikeData[]
): OIDistributionResult {
  // Default values for empty input
  const defaultStrikeOI: StrikeOI = { strike: 0, oi: 0 };
  const defaultStrikeOIChange: StrikeOIChange = { strike: 0, change: 0 };

  if (optionChainData.length === 0) {
    return {
      highestCallOI: defaultStrikeOI,
      highestPutOI: defaultStrikeOI,
      highestCallOIChange: defaultStrikeOIChange,
      highestPutOIChange: defaultStrikeOIChange,
      topCallOIStrikes: [],
      topPutOIStrikes: [],
      summary: 'No OI data available for analysis.',
    };
  }

  // Sort by strike for consistent output
  const sorted = [...optionChainData].sort((a, b) => a.strike - b.strike);

  // ─── Build call and put OI arrays ───────────────────────────────────
  const callOIEntries: StrikeOI[] = sorted.map((d) => ({
    strike: d.strike,
    oi: d.callOI,
  }));
  const putOIEntries: StrikeOI[] = sorted.map((d) => ({
    strike: d.strike,
    oi: d.putOI,
  }));

  // Sort descending by OI for top-N
  const sortedCallOI = [...callOIEntries].sort((a, b) => b.oi - a.oi);
  const sortedPutOI = [...putOIEntries].sort((a, b) => b.oi - a.oi);

  const highestCallOI = sortedCallOI[0] || defaultStrikeOI;
  const highestPutOI = sortedPutOI[0] || defaultStrikeOI;

  const topCallOIStrikes = sortedCallOI.slice(0, TOP_N);
  const topPutOIStrikes = sortedPutOI.slice(0, TOP_N);

  // ─── OI Change analysis ─────────────────────────────────────────────
  let highestCallOIChange = defaultStrikeOIChange;
  let highestPutOIChange = defaultStrikeOIChange;

  const hasChangeData = sorted.some(
    (d) => d.callOIChange !== undefined || d.putOIChange !== undefined
  );

  if (hasChangeData) {
    const callOIChanges: StrikeOIChange[] = sorted
      .filter((d) => d.callOIChange !== undefined)
      .map((d) => ({ strike: d.strike, change: d.callOIChange! }));

    const putOIChanges: StrikeOIChange[] = sorted
      .filter((d) => d.putOIChange !== undefined)
      .map((d) => ({ strike: d.strike, change: d.putOIChange! }));

    // Highest positive changes (new positions being built)
    if (callOIChanges.length > 0) {
      callOIChanges.sort((a, b) => b.change - a.change);
      highestCallOIChange = callOIChanges[0];
    }
    if (putOIChanges.length > 0) {
      putOIChanges.sort((a, b) => b.change - a.change);
      highestPutOIChange = putOIChanges[0];
    }
  }

  // ─── Generate summary ──────────────────────────────────────────────
  const summaryParts: string[] = [];

  summaryParts.push(
    `Immediate resistance at ${highestCallOI.strike} (Call OI: ${formatLargeNumber(highestCallOI.oi)}).`
  );
  summaryParts.push(
    `Immediate support at ${highestPutOI.strike} (Put OI: ${formatLargeNumber(highestPutOI.oi)}).`
  );

  if (highestCallOIChange.change > 0) {
    summaryParts.push(
      `Emerging resistance at ${highestCallOIChange.strike} (Call OI added: +${formatLargeNumber(highestCallOIChange.change)}).`
    );
  }
  if (highestPutOIChange.change > 0) {
    summaryParts.push(
      `Emerging support at ${highestPutOIChange.strike} (Put OI added: +${formatLargeNumber(highestPutOIChange.change)}).`
    );
  }

  // Trading range
  summaryParts.push(
    `Expected trading range: ${highestPutOI.strike} – ${highestCallOI.strike}.`
  );

  return {
    highestCallOI,
    highestPutOI,
    highestCallOIChange,
    highestPutOIChange,
    topCallOIStrikes,
    topPutOIStrikes,
    summary: summaryParts.join(' '),
  };
}

// ─── Formatting Helper ───────────────────────────────────────────────────────

/**
 * Format a large number with K/L/Cr suffixes (Indian convention).
 */
function formatLargeNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000000) {
    return `${(n / 10000000).toFixed(2)} Cr`;
  }
  if (abs >= 100000) {
    return `${(n / 100000).toFixed(2)} L`;
  }
  if (abs >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return n.toString();
}
