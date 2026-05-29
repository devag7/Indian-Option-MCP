/**
 * @fileoverview Implied Volatility Solver
 *
 * Hybrid Newton-Raphson + Bisection method for computing implied volatility
 * from observed market prices. Includes chain-level batch IV computation.
 *
 * Algorithm:
 * 1. Initial guess via Brenner-Subrahmanyam approximation: σ₀ = √(2π/T) × C/S
 * 2. Newton-Raphson iterations with vega as derivative
 * 3. Fallback to bisection if Newton diverges or vega is near-zero
 *
 * @module engine/implied-volatility
 */

import {
  optionPrice,
  vega as bsVega,
  type OptionType,
} from './black-scholes.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Convergence tolerance: |BS(σ) - marketPrice| < TOLERANCE */
const TOLERANCE = 0.001;

/** Maximum Newton-Raphson iterations */
const MAX_NEWTON_ITERATIONS = 50;

/** Maximum bisection iterations */
const MAX_BISECTION_ITERATIONS = 100;

/** Minimum vega threshold — below this, Newton is unreliable */
const MIN_VEGA = 1e-10;

/** Volatility bounds for the solver */
const MIN_VOL = 0.001;  // 0.1%
const MAX_VOL = 5.0;    // 500%

/** Clamp bounds for initial guess */
const INITIAL_GUESS_MIN = 0.05;   // 5%
const INITIAL_GUESS_MAX = 3.0;    // 300%

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Brenner-Subrahmanyam initial volatility estimate.
 *
 * Formula: σ₀ = √(2π/T) × (C/S)
 *
 * This approximation works best for near-ATM options and provides
 * a reasonable starting point for the Newton-Raphson solver.
 *
 * @param marketPrice - Observed option price
 * @param S - Spot price
 * @param T - Time to expiry in years
 * @returns Initial volatility estimate, clamped to [0.05, 3.0]
 */
function brennerSubrahmanyam(marketPrice: number, S: number, T: number): number {
  if (T <= 0 || S <= 0) return 0.3; // sensible default
  const rawGuess = Math.sqrt((2 * Math.PI) / T) * (marketPrice / S);
  return Math.min(Math.max(rawGuess, INITIAL_GUESS_MIN), INITIAL_GUESS_MAX);
}

/**
 * Bisection method for IV — guaranteed convergence within bounds.
 *
 * Binary searches the volatility space [lo, hi] to find σ such that
 * |BS(σ) - marketPrice| < tolerance.
 *
 * @param marketPrice - Observed option market price
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate (decimal)
 * @param type - 'CE' or 'PE'
 * @param q - Dividend yield (decimal)
 * @returns Implied volatility or null if no convergence
 */
function bisectionIV(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  type: OptionType,
  q: number
): number | null {
  let lo = MIN_VOL;
  let hi = MAX_VOL;

  // Verify that a root exists in the bracket
  const priceLo = optionPrice(S, K, T, r, lo, q, type);
  const priceHi = optionPrice(S, K, T, r, hi, q, type);

  // If market price is below the min-vol price or above the max-vol price,
  // no valid IV exists in the bracket
  if (marketPrice < priceLo - TOLERANCE || marketPrice > priceHi + TOLERANCE) {
    return null;
  }

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const priceMid = optionPrice(S, K, T, r, mid, q, type);
    const diff = priceMid - marketPrice;

    if (Math.abs(diff) < TOLERANCE) {
      return mid;
    }

    if (diff > 0) {
      hi = mid;
    } else {
      lo = mid;
    }

    // Additional convergence check on interval width
    if (hi - lo < 1e-8) {
      return mid;
    }
  }

  // Final check: return midpoint if reasonably close
  const finalMid = (lo + hi) / 2;
  const finalPrice = optionPrice(S, K, T, r, finalMid, q, type);
  if (Math.abs(finalPrice - marketPrice) < TOLERANCE * 10) {
    return finalMid;
  }

  return null;
}

// ─── Main IV Solver ──────────────────────────────────────────────────────────

/**
 * Calculate Implied Volatility using hybrid Newton-Raphson + Bisection.
 *
 * Algorithm:
 * 1. Compute initial guess using Brenner-Subrahmanyam: σ₀ = √(2π/T) × (C/S)
 * 2. Clamp initial guess to [0.05, 3.0]
 * 3. Newton-Raphson: σₙ₊₁ = σₙ - (BS(σₙ) - marketPrice) / Vega(σₙ)
 * 4. If |Vega| < 1e-10 OR σ jumps outside [0.001, 5.0] → switch to Bisection
 * 5. Bisection: binary search in [0.001, 5.0] with up to 100 iterations
 * 6. Convergence criterion: |BS(σ) - marketPrice| < 0.001
 * 7. Returns null if no convergence
 *
 * @param marketPrice - Observed option market price (must be positive)
 * @param S - Spot price of the underlying (must be positive)
 * @param K - Strike price (must be positive)
 * @param T - Time to expiry in years (must be positive)
 * @param r - Risk-free interest rate (annualized, decimal)
 * @param type - Option type: 'CE' for call, 'PE' for put
 * @param q - Continuous dividend yield (annualized, decimal, default 0)
 * @returns Implied volatility as a decimal (e.g. 0.25 for 25%), or null if solver fails
 *
 * @example
 * // NIFTY 24500 CE trading at 350 with spot at 24800, 15 days to expiry
 * const iv = calculateIV(350, 24800, 24500, 15/365, 0.07, 'CE');
 * // Returns approximately 0.14 (14%)
 */
export function calculateIV(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  type: OptionType,
  q: number = 0
): number | null {
  // ─── Input validation ────────────────────────────────────────────────
  if (marketPrice <= 0 || S <= 0 || K <= 0 || T <= 0) {
    return null;
  }

  // Check if the market price is below intrinsic value (arbitrage / bad data)
  const intrinsic =
    type === 'CE' ? Math.max(S - K, 0) : Math.max(K - S, 0);
  // Allow a small tolerance for bid-ask around intrinsic
  if (marketPrice < intrinsic - TOLERANCE * 100) {
    return null;
  }

  // Check if market price exceeds upper bound
  // Call upper bound: S·e^(-qT), Put upper bound: K·e^(-rT)
  const upperBound =
    type === 'CE'
      ? S * Math.exp(-q * T)
      : K * Math.exp(-r * T);
  if (marketPrice > upperBound + TOLERANCE * 100) {
    return null;
  }

  // ─── Newton-Raphson ──────────────────────────────────────────────────
  let sigma = brennerSubrahmanyam(marketPrice, S, T);
  let useBisection = false;

  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    const bsPrice = optionPrice(S, K, T, r, sigma, q, type);
    const diff = bsPrice - marketPrice;

    // Check convergence
    if (Math.abs(diff) < TOLERANCE) {
      return sigma;
    }

    // Vega is returned per 1% move, so multiply by 100 to get raw dPrice/dSigma
    const vegaVal = bsVega(S, K, T, r, sigma, q) * 100;

    // If vega is too small, Newton-Raphson is unreliable
    if (Math.abs(vegaVal) < MIN_VEGA) {
      useBisection = true;
      break;
    }

    // Newton step
    const newSigma = sigma - diff / vegaVal;

    // If Newton jumps outside valid bounds, switch to bisection
    if (newSigma <= MIN_VOL || newSigma >= MAX_VOL) {
      useBisection = true;
      break;
    }

    // Check for oscillation (sigma not converging)
    if (i > 10 && Math.abs(newSigma - sigma) < 1e-12) {
      // Effectively converged in sigma space
      const finalPrice = optionPrice(S, K, T, r, newSigma, q, type);
      if (Math.abs(finalPrice - marketPrice) < TOLERANCE * 10) {
        return newSigma;
      }
      useBisection = true;
      break;
    }

    sigma = newSigma;
  }

  // ─── Bisection fallback ──────────────────────────────────────────────
  if (useBisection) {
    return bisectionIV(marketPrice, S, K, T, r, type, q);
  }

  // Newton didn't converge within max iterations — try bisection anyway
  return bisectionIV(marketPrice, S, K, T, r, type, q);
}

// ─── Chain-Level IV Calculation ──────────────────────────────────────────────

/** Input row for chain-level IV computation */
export interface ChainRow {
  /** Strike price */
  strike: number;
  /** Last traded price */
  ltp: number;
  /** Option type */
  type: OptionType;
  /** Spot price of the underlying */
  spotPrice: number;
  /** Expiry date string (ISO format or DD-MMM-YYYY) */
  expiryDate: string;
}

/**
 * Calculate days between two dates.
 * @param from - Start date
 * @param to - End date (expiry)
 * @returns Number of calendar days between the dates
 */
function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(
    (to.getTime() - from.getTime()) / msPerDay,
    0.001 // minimum ~1 minute
  );
}

/**
 * Parse an expiry date string into a Date object.
 * Handles ISO format (YYYY-MM-DD) and common Indian formats (DD-MMM-YYYY).
 *
 * @param dateStr - Date string to parse
 * @returns Parsed Date object
 */
function parseExpiryDate(dateStr: string): Date {
  // Try ISO format first
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  // Try DD-MMM-YYYY (e.g., "29-MAY-2025")
  const months: Record<string, number> = {
    JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
    JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  };
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = months[parts[1].toUpperCase()];
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  // Fallback: return current date (will result in ~0 T)
  return new Date();
}

/**
 * Calculate IV for an entire option chain.
 *
 * Computes implied volatility for each row in the option chain data.
 * Results are keyed by "strike-type" (e.g., "24500-CE").
 *
 * Skips rows where:
 * - LTP is zero or negative
 * - Time to expiry is non-positive
 * - IV solver fails to converge
 *
 * @param optionChainRows - Array of option chain data rows
 * @param r - Risk-free interest rate (annualized, decimal)
 * @param q - Continuous dividend yield (annualized, decimal, default 0)
 * @returns Map with key "strike-type" and value implied volatility (decimal)
 *
 * @example
 * const chain = [
 *   { strike: 24500, ltp: 350, type: 'CE', spotPrice: 24800, expiryDate: '2025-06-12' },
 *   { strike: 24500, ltp: 50,  type: 'PE', spotPrice: 24800, expiryDate: '2025-06-12' },
 * ];
 * const ivMap = calculateIVForChain(chain, 0.07);
 * // ivMap.get("24500-CE") → 0.1423...
 */
export function calculateIVForChain(
  optionChainRows: ChainRow[],
  r: number,
  q: number = 0
): Map<string, number> {
  const ivMap = new Map<string, number>();
  const now = new Date();

  for (const row of optionChainRows) {
    // Skip invalid rows
    if (row.ltp <= 0 || row.strike <= 0 || row.spotPrice <= 0) {
      continue;
    }

    const expiryDate = parseExpiryDate(row.expiryDate);
    const daysToExpiry = daysBetween(now, expiryDate);
    const T = daysToExpiry / 365;

    if (T <= 0) {
      continue;
    }

    const iv = calculateIV(
      row.ltp,
      row.spotPrice,
      row.strike,
      T,
      r,
      row.type,
      q
    );

    if (iv !== null) {
      const key = `${row.strike}-${row.type}`;
      ivMap.set(key, iv);
    }
  }

  return ivMap;
}
