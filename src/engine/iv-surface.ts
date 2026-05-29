/**
 * @module engine/iv-surface
 * Implied Volatility surface, smile, skew, and term structure analysis.
 * Provides tools for analyzing the volatility landscape across strikes and expiries.
 */

import { normCDF, standardDeviation, logReturns, percentile, mean } from '../utils/math.js';

/** Data point for IV smile visualization */
export interface IVSmilePoint {
  strike: number;
  moneyness: number;
  callIV: number | null;
  putIV: number | null;
  avgIV: number | null;
}

/** ATM IV for a specific expiry */
export interface IVTermPoint {
  expiry: string;
  iv: number;
  daysToExpiry: number;
}

/** IV skew analysis result */
export interface IVSkewResult {
  skew: number;
  description: string;
  otmPutIV: number;
  atmIV: number;
  otmCallIV: number;
}

/** HV vs IV comparison */
export interface HVvsIVResult {
  hv: number;
  iv: number;
  spread: number;
  spreadPercent: number;
  interpretation: string;
  tradeSuggestion: string;
}

/**
 * Calculate IV smile across strikes for a single expiry.
 * Returns IV plotted against moneyness (K/S).
 *
 * @param chainData - Array of {strike, callIV?, putIV?}
 * @param spotPrice - Current underlying price
 */
export function calculateIVSmile(
  chainData: Array<{ strike: number; callIV?: number | null; putIV?: number | null }>,
  spotPrice: number
): IVSmilePoint[] {
  return chainData
    .filter(d => d.callIV || d.putIV)
    .map(d => {
      const moneyness = d.strike / spotPrice;
      const callIV = d.callIV && d.callIV > 0 ? d.callIV : null;
      const putIV = d.putIV && d.putIV > 0 ? d.putIV : null;
      let avgIV: number | null = null;
      if (callIV !== null && putIV !== null) {
        avgIV = (callIV + putIV) / 2;
      } else {
        avgIV = callIV ?? putIV;
      }
      return { strike: d.strike, moneyness, callIV, putIV, avgIV };
    })
    .sort((a, b) => a.strike - b.strike);
}

/**
 * Calculate IV term structure — ATM IV across different expiries.
 * Shows how the market prices volatility over different time horizons.
 *
 * @param atmIVsByExpiry - Array of {expiry, iv, daysToExpiry}
 */
export function calculateIVTermStructure(
  atmIVsByExpiry: IVTermPoint[]
): IVTermPoint[] {
  return [...atmIVsByExpiry]
    .filter(p => p.iv > 0 && p.daysToExpiry > 0)
    .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

/**
 * Calculate IV skew: measures the difference between OTM put and OTM call IV.
 * A positive skew (normal) means OTM puts are more expensive — reflecting demand
 * for downside protection.
 *
 * Skew = (25Δ Put IV - 25Δ Call IV) / ATM IV
 *
 * @param chainData - Array of {strike, callIV?, putIV?}
 * @param spotPrice - Current underlying price
 */
export function calculateIVSkew(
  chainData: Array<{ strike: number; callIV?: number | null; putIV?: number | null }>,
  spotPrice: number
): IVSkewResult {
  const sorted = chainData
    .filter(d => (d.callIV && d.callIV > 0) || (d.putIV && d.putIV > 0))
    .sort((a, b) => a.strike - b.strike);

  if (sorted.length < 3) {
    return { skew: 0, description: 'Insufficient data', otmPutIV: 0, atmIV: 0, otmCallIV: 0 };
  }

  // Find ATM strike (closest to spot)
  const atmIdx = sorted.reduce((closest, d, i) =>
    Math.abs(d.strike - spotPrice) < Math.abs(sorted[closest].strike - spotPrice) ? i : closest, 0);

  const atmData = sorted[atmIdx];
  const atmIV = (atmData.callIV || atmData.putIV || 0);

  if (atmIV <= 0) {
    return { skew: 0, description: 'ATM IV not available', otmPutIV: 0, atmIV: 0, otmCallIV: 0 };
  }

  // OTM Put: ~5% below spot
  const targetPutStrike = spotPrice * 0.95;
  const otmPutData = sorted.reduce((closest, d) =>
    d.strike < spotPrice && Math.abs(d.strike - targetPutStrike) < Math.abs(closest.strike - targetPutStrike) ? d : closest, sorted[0]);
  const otmPutIV = otmPutData.putIV || otmPutData.callIV || 0;

  // OTM Call: ~5% above spot
  const targetCallStrike = spotPrice * 1.05;
  const otmCallData = sorted.reduce((closest, d) =>
    d.strike > spotPrice && Math.abs(d.strike - targetCallStrike) < Math.abs(closest.strike - targetCallStrike) ? d : closest, sorted[sorted.length - 1]);
  const otmCallIV = otmCallData.callIV || otmCallData.putIV || 0;

  const skew = atmIV > 0 ? (otmPutIV - otmCallIV) / atmIV : 0;

  let description: string;
  if (skew > 0.15) description = 'Strong put skew — significant downside fear';
  else if (skew > 0.05) description = 'Normal put skew — typical market conditions';
  else if (skew > -0.05) description = 'Flat skew — balanced sentiment';
  else if (skew > -0.15) description = 'Call skew — upside demand exceeds downside';
  else description = 'Strong call skew — extreme bullish demand';

  return { skew, description, otmPutIV, atmIV, otmCallIV };
}

/**
 * Calculate IV Rank — where current IV sits relative to its 52-week range.
 * IV Rank = (Current IV - 52wk Low) / (52wk High - 52wk Low) × 100
 *
 * @param currentIV - Current implied volatility
 * @param ivHistory - Array of historical IV values (ideally 252 trading days)
 * @returns IV Rank as 0-100
 */
export function calculateIVRank(currentIV: number, ivHistory: number[]): number {
  if (ivHistory.length === 0) return 50;
  const min = Math.min(...ivHistory);
  const max = Math.max(...ivHistory);
  if (max === min) return 50;
  return Math.max(0, Math.min(100, ((currentIV - min) / (max - min)) * 100));
}

/**
 * Calculate IV Percentile — percentage of days IV was below current level.
 * More robust than IV Rank as it's not distorted by extreme outliers.
 *
 * @param currentIV - Current implied volatility
 * @param ivHistory - Array of historical IV values
 * @returns IV Percentile as 0-100
 */
export function calculateIVPercentile(currentIV: number, ivHistory: number[]): number {
  if (ivHistory.length === 0) return 50;
  const below = ivHistory.filter(iv => iv < currentIV).length;
  return (below / ivHistory.length) * 100;
}

/**
 * Calculate Historical (Realized) Volatility from close prices.
 * Uses log returns with annualization (√252 trading days).
 *
 * HV = σ(log returns) × √252
 *
 * @param closePrices - Array of closing prices (most recent last)
 * @param window - Lookback window in trading days (default 20)
 */
export function calculateHistoricalVolatility(
  closePrices: number[],
  window: number = 20
): number {
  if (closePrices.length < window + 1) {
    if (closePrices.length < 2) return 0;
    // Use whatever data is available
    const returns = logReturns(closePrices);
    return standardDeviation(returns) * Math.sqrt(252);
  }

  const recentPrices = closePrices.slice(-window - 1);
  const returns = logReturns(recentPrices);
  return standardDeviation(returns) * Math.sqrt(252);
}

/**
 * Compare Historical Volatility vs Implied Volatility.
 * When IV > HV, options are "expensive" → favor selling strategies.
 * When IV < HV, options are "cheap" → favor buying strategies.
 *
 * @param hv - Historical volatility (annualized, decimal)
 * @param iv - Implied volatility (annualized, decimal)
 */
export function hvVsIvAnalysis(hv: number, iv: number): HVvsIVResult {
  const spread = iv - hv;
  const spreadPercent = hv > 0 ? (spread / hv) * 100 : 0;

  let interpretation: string;
  let tradeSuggestion: string;

  if (spreadPercent > 20) {
    interpretation = 'IV significantly overpriced vs realized volatility';
    tradeSuggestion = 'Favor option SELLING strategies (Iron Condors, Short Strangles, Credit Spreads)';
  } else if (spreadPercent > 5) {
    interpretation = 'IV moderately above realized volatility — options slightly expensive';
    tradeSuggestion = 'Lean towards selling or neutral strategies';
  } else if (spreadPercent > -5) {
    interpretation = 'IV fairly priced relative to historical volatility';
    tradeSuggestion = 'No strong edge from volatility — use directional view';
  } else if (spreadPercent > -20) {
    interpretation = 'IV below realized volatility — options are cheap';
    tradeSuggestion = 'Favor option BUYING strategies (Long Straddles, Debit Spreads)';
  } else {
    interpretation = 'IV significantly underpriced — rare opportunity for option buyers';
    tradeSuggestion = 'Strong edge in buying options (Long Straddles, Long Strangles)';
  }

  return { hv, iv, spread, spreadPercent, interpretation, tradeSuggestion };
}

/**
 * Calculate Expected Move based on ATM straddle / IV.
 * Expected Move = Spot × IV × √(DTE/365)
 *
 * At 1σ (68% confidence), the market expects the underlying to stay within ±ExpectedMove.
 *
 * @param spotPrice - Current underlying price
 * @param iv - ATM implied volatility (annualized, decimal e.g. 0.15 for 15%)
 * @param daysToExpiry - Calendar days to expiry
 * @param confidence - Confidence level (1 for 68%, 1.645 for 90%, 1.96 for 95%, 2.576 for 99%)
 */
export function expectedMove(
  spotPrice: number,
  iv: number,
  daysToExpiry: number,
  confidence: number = 1
): { upper: number; lower: number; range: number; movePercent: number } {
  const move = spotPrice * iv * Math.sqrt(daysToExpiry / 365) * confidence;
  return {
    upper: spotPrice + move,
    lower: spotPrice - move,
    range: move * 2,
    movePercent: (move / spotPrice) * 100,
  };
}
