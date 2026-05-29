/**
 * @fileoverview Black-Scholes-Merton Option Pricing Engine
 *
 * Complete implementation of the BSM model for European option pricing,
 * including all first-order Greeks (delta, gamma, theta, vega, rho) and
 * higher-order Greeks (charm, vanna, volga).
 *
 * Supports continuous dividend yield (q) for index options.
 *
 * @module engine/black-scholes
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Option type: Call (CE) or Put (PE) */
export type OptionType = 'CE' | 'PE';

/** Complete Greeks data for an option position */
export interface GreeksData {
  /** Rate of change of option price w.r.t. underlying price */
  delta: number;
  /** Rate of change of delta w.r.t. underlying price */
  gamma: number;
  /** Rate of change of option price w.r.t. time (per calendar day) */
  theta: number;
  /** Rate of change of option price w.r.t. volatility (per 1% move) */
  vega: number;
  /** Rate of change of option price w.r.t. risk-free rate (per 1% move) */
  rho: number;
  /** dDelta/dTime — delta decay */
  charm?: number;
  /** dDelta/dVol — delta sensitivity to volatility */
  vanna?: number;
  /** dVega/dVol — vega convexity */
  volga?: number;
}

// ─── Inlined Math Utilities ──────────────────────────────────────────────────
// These are inlined to avoid import dependency issues during bootstrapping.
// They match the implementations that will be in ../utils/math.ts

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/**
 * Standard normal probability density function.
 *
 * Formula: n(x) = (1/√(2π)) · e^(-x²/2)
 *
 * @param x - The input value
 * @returns The probability density at x
 */
function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/**
 * Cumulative standard normal distribution function.
 *
 * Uses the Abramowitz & Stegun rational approximation (formula 26.2.17)
 * with maximum error < 7.5e-8.
 *
 * Formula: N(x) = 1 - n(x)(b₁t + b₂t² + b₃t³ + b₄t⁴ + b₅t⁵) for x ≥ 0
 * where t = 1/(1 + 0.2316419·x)
 *
 * @param x - The input value
 * @returns The cumulative probability P(Z ≤ x)
 */
function normCDF(x: number): number {
  if (x > 10) return 1;
  if (x < -10) return 0;

  const a1 = 0.319381530;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const p = 0.2316419;

  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  const poly = a1 * t + a2 * t2 + a3 * t3 + a4 * t4 + a5 * t5;
  const result = 1.0 - normPDF(absX) * poly;

  return x >= 0 ? result : 1.0 - result;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/** Minimum time to expiry to avoid division by zero */
const MIN_T = 1e-10;
/** Minimum volatility to avoid division by zero */
const MIN_SIGMA = 1e-10;

/**
 * Calculate d1 and d2 parameters for the BSM model.
 *
 * Formulas:
 *   d1 = [ln(S/K) + (r - q + σ²/2)·T] / (σ·√T)
 *   d2 = d1 - σ·√T
 *
 * @param S - Spot price of the underlying
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free interest rate (annualized, decimal)
 * @param sigma - Volatility (annualized, decimal)
 * @param q - Continuous dividend yield (annualized, decimal)
 * @returns Object containing d1, d2, and sqrtT
 */
function calcD1D2(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number
): { d1: number; d2: number; sqrtT: number } {
  const sqrtT = Math.sqrt(T);
  const d1 =
    (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return { d1, d2, sqrtT };
}

/**
 * Returns intrinsic value of an option.
 * Used as fallback for edge cases (T ≤ 0, σ ≤ 0).
 */
function intrinsicValue(
  S: number,
  K: number,
  type: OptionType
): number {
  if (type === 'CE') {
    return Math.max(S - K, 0);
  }
  return Math.max(K - S, 0);
}

// ─── Core Pricing Functions ──────────────────────────────────────────────────

/**
 * Black-Scholes call option price.
 *
 * Formula: C = S·e^(-qT)·N(d1) - K·e^(-rT)·N(d2)
 *
 * @param S - Spot price of the underlying
 * @param K - Strike price
 * @param T - Time to expiry in years (must be > 0 for BSM pricing)
 * @param r - Risk-free interest rate (annualized, decimal, e.g. 0.07 for 7%)
 * @param sigma - Volatility (annualized, decimal, e.g. 0.20 for 20%)
 * @param q - Continuous dividend yield (annualized, decimal, default 0)
 * @returns The theoretical call option price
 */
export function callPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0
): number {
  // Edge cases
  if (S <= 0) return 0;
  if (T <= MIN_T) return intrinsicValue(S, K, 'CE');
  if (sigma <= MIN_SIGMA) {
    // With zero vol, option is worth the discounted intrinsic value
    const forward = S * Math.exp((r - q) * T);
    return Math.max(forward - K, 0) * Math.exp(-r * T);
  }

  const { d1, d2 } = calcD1D2(S, K, T, r, sigma, q);
  const discountDividend = Math.exp(-q * T);
  const discountRate = Math.exp(-r * T);

  return S * discountDividend * normCDF(d1) - K * discountRate * normCDF(d2);
}

/**
 * Black-Scholes put option price.
 *
 * Formula: P = K·e^(-rT)·N(-d2) - S·e^(-qT)·N(-d1)
 *
 * @param S - Spot price of the underlying
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free interest rate (annualized, decimal)
 * @param sigma - Volatility (annualized, decimal)
 * @param q - Continuous dividend yield (annualized, decimal, default 0)
 * @returns The theoretical put option price
 */
export function putPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0
): number {
  // Edge cases
  if (S <= 0) return Math.max(K, 0);
  if (T <= MIN_T) return intrinsicValue(S, K, 'PE');
  if (sigma <= MIN_SIGMA) {
    const forward = S * Math.exp((r - q) * T);
    return Math.max(K - forward, 0) * Math.exp(-r * T);
  }

  const { d1, d2 } = calcD1D2(S, K, T, r, sigma, q);
  const discountDividend = Math.exp(-q * T);
  const discountRate = Math.exp(-r * T);

  return K * discountRate * normCDF(-d2) - S * discountDividend * normCDF(-d1);
}

/**
 * Unified option price function.
 *
 * @param S - Spot price of the underlying
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free interest rate (annualized, decimal)
 * @param sigma - Volatility (annualized, decimal)
 * @param q - Continuous dividend yield (annualized, decimal, default 0)
 * @param type - Option type: 'CE' for call, 'PE' for put
 * @returns The theoretical option price
 */
export function optionPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0,
  type: OptionType = 'CE'
): number {
  return type === 'CE'
    ? callPrice(S, K, T, r, sigma, q)
    : putPrice(S, K, T, r, sigma, q);
}

// ─── First-Order Greeks ──────────────────────────────────────────────────────

/**
 * Option delta — rate of change of price w.r.t. underlying.
 *
 * Formula:
 *   Delta_Call = e^(-qT) · N(d1)
 *   Delta_Put  = e^(-qT) · (N(d1) - 1) = -e^(-qT) · N(-d1)
 *
 * Range: Call delta ∈ [0, 1], Put delta ∈ [-1, 0]
 *
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate (decimal)
 * @param sigma - Volatility (decimal)
 * @param q - Dividend yield (decimal, default 0)
 * @param type - 'CE' or 'PE'
 * @returns Delta value
 */
export function delta(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0,
  type: OptionType = 'CE'
): number {
  if (S <= 0) return 0;
  if (T <= MIN_T) {
    // At expiry, delta is 1 (ITM), 0 (OTM), ~0.5 (ATM)
    if (type === 'CE') return S > K ? 1 : S === K ? 0.5 : 0;
    return S < K ? -1 : S === K ? -0.5 : 0;
  }
  if (sigma <= MIN_SIGMA) {
    const forward = S * Math.exp((r - q) * T);
    if (type === 'CE') return forward > K ? Math.exp(-q * T) : 0;
    return forward < K ? -Math.exp(-q * T) : 0;
  }

  const { d1 } = calcD1D2(S, K, T, r, sigma, q);
  const discountDividend = Math.exp(-q * T);

  if (type === 'CE') {
    return discountDividend * normCDF(d1);
  }
  return discountDividend * (normCDF(d1) - 1);
}

/**
 * Option gamma — rate of change of delta w.r.t. underlying.
 * Same for both calls and puts.
 *
 * Formula: Γ = e^(-qT) · n(d1) / (S · σ · √T)
 *
 * Always positive. Highest for ATM options near expiry.
 *
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate (decimal)
 * @param sigma - Volatility (decimal)
 * @param q - Dividend yield (decimal, default 0)
 * @returns Gamma value
 */
export function gamma(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0
): number {
  if (S <= 0 || T <= MIN_T || sigma <= MIN_SIGMA) return 0;

  const { d1, sqrtT } = calcD1D2(S, K, T, r, sigma, q);
  const discountDividend = Math.exp(-q * T);

  return (discountDividend * normPDF(d1)) / (S * sigma * sqrtT);
}

/**
 * Option theta — rate of change of price w.r.t. time.
 * Returned as value per CALENDAR DAY (divided by 365).
 *
 * Formulas:
 *   Θ_Call = -[S·e^(-qT)·n(d1)·σ / (2√T)] + q·S·e^(-qT)·N(d1) - r·K·e^(-rT)·N(d2)
 *   Θ_Put  = -[S·e^(-qT)·n(d1)·σ / (2√T)] - q·S·e^(-qT)·N(-d1) + r·K·e^(-rT)·N(-d2)
 *
 * Then divided by 365 to get per-day theta.
 * Typically negative (time decay hurts option buyers).
 *
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate (decimal)
 * @param sigma - Volatility (decimal)
 * @param q - Dividend yield (decimal, default 0)
 * @param type - 'CE' or 'PE'
 * @returns Theta per calendar day
 */
export function theta(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0,
  type: OptionType = 'CE'
): number {
  if (S <= 0 || T <= MIN_T || sigma <= MIN_SIGMA) return 0;

  const { d1, d2, sqrtT } = calcD1D2(S, K, T, r, sigma, q);
  const discountDividend = Math.exp(-q * T);
  const discountRate = Math.exp(-r * T);
  const nd1 = normPDF(d1);

  // Common term: time decay of the option due to diffusion
  const diffusionTerm = -(S * discountDividend * nd1 * sigma) / (2 * sqrtT);

  let annualTheta: number;

  if (type === 'CE') {
    annualTheta =
      diffusionTerm +
      q * S * discountDividend * normCDF(d1) -
      r * K * discountRate * normCDF(d2);
  } else {
    annualTheta =
      diffusionTerm -
      q * S * discountDividend * normCDF(-d1) +
      r * K * discountRate * normCDF(-d2);
  }

  // Return per calendar day
  return annualTheta / 365;
}

/**
 * Option vega — sensitivity of price to volatility.
 * Returned per 1% move in volatility (divided by 100).
 * Same for both calls and puts.
 *
 * Formula: ν = S · e^(-qT) · n(d1) · √T
 * Then divided by 100 for per-percentage-point.
 *
 * Always positive. Highest for ATM options with longer expiry.
 *
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate (decimal)
 * @param sigma - Volatility (decimal)
 * @param q - Dividend yield (decimal, default 0)
 * @returns Vega per 1% volatility move
 */
export function vega(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0
): number {
  if (S <= 0 || T <= MIN_T || sigma <= MIN_SIGMA) return 0;

  const { d1, sqrtT } = calcD1D2(S, K, T, r, sigma, q);
  const discountDividend = Math.exp(-q * T);

  return (S * discountDividend * normPDF(d1) * sqrtT) / 100;
}

/**
 * Option rho — sensitivity of price to risk-free interest rate.
 * Returned per 1% move in rate (divided by 100).
 *
 * Formulas:
 *   ρ_Call = K · T · e^(-rT) · N(d2) / 100
 *   ρ_Put  = -K · T · e^(-rT) · N(-d2) / 100
 *
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate (decimal)
 * @param sigma - Volatility (decimal)
 * @param q - Dividend yield (decimal, default 0)
 * @param type - 'CE' or 'PE'
 * @returns Rho per 1% rate move
 */
export function rho(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0,
  type: OptionType = 'CE'
): number {
  if (S <= 0 || T <= MIN_T || sigma <= MIN_SIGMA) return 0;

  const { d2 } = calcD1D2(S, K, T, r, sigma, q);
  const discountRate = Math.exp(-r * T);

  if (type === 'CE') {
    return (K * T * discountRate * normCDF(d2)) / 100;
  }
  return -(K * T * discountRate * normCDF(-d2)) / 100;
}

// ─── Higher-Order Greeks ─────────────────────────────────────────────────────

/**
 * Charm (delta bleed) — dDelta/dTime.
 * Measures how delta changes as time passes.
 *
 * Formula:
 *   Charm_Call = -e^(-qT) · [n(d1) · (2(r-q)T - d2·σ·√T) / (2T·σ·√T)] - q·e^(-qT)·N(d1)
 *   Charm_Put  = -e^(-qT) · [n(d1) · (2(r-q)T - d2·σ·√T) / (2T·σ·√T)] + q·e^(-qT)·N(-d1)
 *
 * Returned per calendar day (divided by 365).
 *
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate (decimal)
 * @param sigma - Volatility (decimal)
 * @param q - Dividend yield (decimal, default 0)
 * @param type - 'CE' or 'PE'
 * @returns Charm per calendar day
 */
export function charm(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0,
  type: OptionType = 'CE'
): number {
  if (S <= 0 || T <= MIN_T || sigma <= MIN_SIGMA) return 0;

  const { d1, d2, sqrtT } = calcD1D2(S, K, T, r, sigma, q);
  const discountDividend = Math.exp(-q * T);
  const nd1 = normPDF(d1);

  const commonTerm =
    discountDividend *
    nd1 *
    (2 * (r - q) * T - d2 * sigma * sqrtT) /
    (2 * T * sigma * sqrtT);

  let annualCharm: number;

  if (type === 'CE') {
    annualCharm = -commonTerm - q * discountDividend * normCDF(d1);
  } else {
    annualCharm = -commonTerm + q * discountDividend * normCDF(-d1);
  }

  // Note: charm is naturally dDelta/dT where T decreases, so we negate
  // to represent the daily change as time passes (T decreasing)
  return -annualCharm / 365;
}

/**
 * Vanna — dDelta/dSigma = dVega/dSpot.
 * Cross-Greek measuring how delta changes with volatility.
 * Same for calls and puts.
 *
 * Formula: Vanna = -e^(-qT) · n(d1) · d2 / σ
 *
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate (decimal)
 * @param sigma - Volatility (decimal)
 * @param q - Dividend yield (decimal, default 0)
 * @returns Vanna value
 */
export function vanna(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0
): number {
  if (S <= 0 || T <= MIN_T || sigma <= MIN_SIGMA) return 0;

  const { d1, d2 } = calcD1D2(S, K, T, r, sigma, q);
  const discountDividend = Math.exp(-q * T);

  return -discountDividend * normPDF(d1) * (d2 / sigma);
}

/**
 * Volga (vomma) — dVega/dSigma.
 * Measures convexity of vega with respect to volatility.
 * Same for calls and puts.
 *
 * Formula: Volga = S · e^(-qT) · n(d1) · √T · (d1 · d2) / σ
 *
 * @param S - Spot price
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free rate (decimal)
 * @param sigma - Volatility (decimal)
 * @param q - Dividend yield (decimal, default 0)
 * @returns Volga value
 */
export function volga(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0
): number {
  if (S <= 0 || T <= MIN_T || sigma <= MIN_SIGMA) return 0;

  const { d1, d2, sqrtT } = calcD1D2(S, K, T, r, sigma, q);
  const discountDividend = Math.exp(-q * T);

  return S * discountDividend * normPDF(d1) * sqrtT * (d1 * d2) / sigma;
}

// ─── Composite Greeks Calculator ─────────────────────────────────────────────

/**
 * Calculate all Greeks for an option in a single pass.
 * More efficient than calling individual Greek functions since d1/d2 are
 * computed only once.
 *
 * @param S - Spot price of the underlying
 * @param K - Strike price
 * @param T - Time to expiry in years
 * @param r - Risk-free interest rate (annualized, decimal)
 * @param sigma - Volatility (annualized, decimal)
 * @param q - Continuous dividend yield (annualized, decimal, default 0)
 * @param type - Option type: 'CE' for call, 'PE' for put
 * @returns Complete Greeks data including higher-order Greeks
 */
export function calculateGreeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q: number = 0,
  type: OptionType = 'CE'
): GreeksData {
  // Edge cases: return zeros for degenerate inputs
  if (S <= 0 || T <= MIN_T || sigma <= MIN_SIGMA) {
    let edgeDelta = 0;
    if (S > 0 && T <= MIN_T) {
      if (type === 'CE') edgeDelta = S > K ? 1 : S === K ? 0.5 : 0;
      else edgeDelta = S < K ? -1 : S === K ? -0.5 : 0;
    }
    return {
      delta: edgeDelta,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
      charm: 0,
      vanna: 0,
      volga: 0,
    };
  }

  const { d1, d2, sqrtT } = calcD1D2(S, K, T, r, sigma, q);
  const discountDividend = Math.exp(-q * T);
  const discountRate = Math.exp(-r * T);
  const nd1 = normPDF(d1);
  const Nd1 = normCDF(d1);
  const Nd2 = normCDF(d2);
  const NnegD1 = normCDF(-d1);
  const NnegD2 = normCDF(-d2);

  // Delta
  const deltaVal =
    type === 'CE'
      ? discountDividend * Nd1
      : discountDividend * (Nd1 - 1);

  // Gamma (same for CE/PE)
  const gammaVal = (discountDividend * nd1) / (S * sigma * sqrtT);

  // Theta
  const diffusionTerm = -(S * discountDividend * nd1 * sigma) / (2 * sqrtT);
  let thetaAnnual: number;
  if (type === 'CE') {
    thetaAnnual =
      diffusionTerm +
      q * S * discountDividend * Nd1 -
      r * K * discountRate * Nd2;
  } else {
    thetaAnnual =
      diffusionTerm -
      q * S * discountDividend * NnegD1 +
      r * K * discountRate * NnegD2;
  }
  const thetaVal = thetaAnnual / 365;

  // Vega (per 1% move)
  const vegaVal = (S * discountDividend * nd1 * sqrtT) / 100;

  // Rho (per 1% move)
  const rhoVal =
    type === 'CE'
      ? (K * T * discountRate * Nd2) / 100
      : -(K * T * discountRate * NnegD2) / 100;

  // Charm (per calendar day)
  const charmCommon =
    discountDividend *
    nd1 *
    (2 * (r - q) * T - d2 * sigma * sqrtT) /
    (2 * T * sigma * sqrtT);
  let charmAnnual: number;
  if (type === 'CE') {
    charmAnnual = -charmCommon - q * discountDividend * Nd1;
  } else {
    charmAnnual = -charmCommon + q * discountDividend * NnegD1;
  }
  const charmVal = -charmAnnual / 365;

  // Vanna
  const vannaVal = -discountDividend * nd1 * (d2 / sigma);

  // Volga
  const volgaVal = S * discountDividend * nd1 * sqrtT * (d1 * d2) / sigma;

  return {
    delta: deltaVal,
    gamma: gammaVal,
    theta: thetaVal,
    vega: vegaVal,
    rho: rhoVal,
    charm: charmVal,
    vanna: vannaVal,
    volga: volgaVal,
  };
}

// Re-export normPDF and normCDF for use by sibling modules (e.g. implied-volatility)
export { normPDF, normCDF };
