/**
 * @module engine/risk-metrics
 * Risk management calculations: Probability of Profit, VaR, Expected Move,
 * Kelly Criterion, and position sizing for Indian options strategies.
 */

import { normCDF } from '../utils/math.js';

/**
 * Calculate Probability of Profit (POP) for an options strategy.
 * Uses the log-normal distribution assumption.
 *
 * For CREDIT strategies: P(spot stays between breakevens at expiry)
 * For DEBIT strategies: P(spot moves beyond breakeven)
 *
 * @param breakevens - Breakeven price(s) of the strategy
 * @param spotPrice - Current underlying price
 * @param iv - Implied volatility (annualized decimal)
 * @param daysToExpiry - Calendar days to expiry
 * @param strategyType - 'CREDIT' or 'DEBIT'
 */
export function probabilityOfProfit(
  breakevens: number[],
  spotPrice: number,
  iv: number,
  daysToExpiry: number,
  strategyType: 'CREDIT' | 'DEBIT'
): number {
  if (breakevens.length === 0 || spotPrice <= 0 || iv <= 0 || daysToExpiry <= 0) return 0;

  const T = daysToExpiry / 365;
  const sigma = iv * Math.sqrt(T);

  // Using log-normal distribution: P(S < K) = N((ln(K/S) - σ²/2) / σ)
  function probBelow(targetPrice: number): number {
    if (targetPrice <= 0) return 0;
    const d = (Math.log(targetPrice / spotPrice) - (sigma * sigma) / 2) / sigma;
    return normCDF(d);
  }

  const sortedBE = [...breakevens].sort((a, b) => a - b);

  if (sortedBE.length === 1) {
    const probBelowBE = probBelow(sortedBE[0]);
    // Credit: profitable if stays on one side; Debit: profitable if moves past
    return strategyType === 'CREDIT'
      ? (sortedBE[0] > spotPrice ? probBelowBE : 1 - probBelowBE)
      : (sortedBE[0] > spotPrice ? 1 - probBelowBE : probBelowBE);
  }

  if (sortedBE.length === 2) {
    const probBetween = probBelow(sortedBE[1]) - probBelow(sortedBE[0]);
    return strategyType === 'CREDIT' ? probBetween : 1 - probBetween;
  }

  // 3+ breakevens: sum the profitable regions
  if (strategyType === 'CREDIT') {
    // Profitable between pairs of breakevens
    let pop = 0;
    for (let i = 0; i < sortedBE.length - 1; i += 2) {
      pop += probBelow(sortedBE[i + 1]) - probBelow(sortedBE[i]);
    }
    return Math.max(0, Math.min(1, pop));
  } else {
    // Profitable outside breakeven pairs
    let probInsideUnprofitable = 0;
    for (let i = 0; i < sortedBE.length - 1; i += 2) {
      probInsideUnprofitable += probBelow(sortedBE[i + 1]) - probBelow(sortedBE[i]);
    }
    return Math.max(0, Math.min(1, 1 - probInsideUnprofitable));
  }
}

/**
 * Calculate Value at Risk (VaR) — maximum expected loss over a time horizon
 * at a given confidence level.
 *
 * Parametric VaR = Position Value × σ × √(days) × z-score
 *
 * @param positionValue - Total position value (premium paid or margin blocked)
 * @param iv - Implied volatility (annualized decimal)
 * @param daysHorizon - Time horizon in days
 * @param confidence - Confidence level (default 0.95 for 95%)
 */
export function calculateVaR(
  positionValue: number,
  iv: number,
  daysHorizon: number,
  confidence: number = 0.95
): number {
  // Z-scores for common confidence levels
  const zScores: Record<number, number> = {
    0.90: 1.2816,
    0.95: 1.6449,
    0.99: 2.3263,
  };
  const z = zScores[confidence] ?? -1 * Math.log(1 - confidence) * 1.5; // rough approximation

  const dailyVol = iv / Math.sqrt(252);
  return Math.abs(positionValue) * dailyVol * Math.sqrt(daysHorizon) * z;
}

/**
 * Calculate Expected Shortfall (CVaR) — average loss beyond VaR.
 * More conservative than VaR as it captures tail risk.
 *
 * CVaR ≈ VaR × (φ(z) / (1 - confidence))
 *
 * @param var_ - Value at Risk
 * @param confidence - Confidence level used for VaR
 */
export function calculateCVaR(var_: number, confidence: number = 0.95): number {
  // ES/CVaR is typically 1.1-1.5x VaR for normal distributions
  const multiplier = 1 / (1 - confidence);
  const pdf_at_z = 0.3989 * Math.exp(-0.5 * Math.pow(1.6449, 2)); // approx for 95%
  return var_ * pdf_at_z * multiplier / 1.6449;
}

/**
 * Kelly Criterion — optimal fraction of capital to risk on a trade.
 * Kelly% = (W × R - L) / R
 * where W = win probability, R = avg win/avg loss ratio, L = loss probability
 *
 * @param winProbability - Probability of winning (0-1)
 * @param avgWin - Average winning amount
 * @param avgLoss - Average losing amount (positive number)
 * @returns Optimal fraction of capital to allocate (0-1)
 */
export function kellyFraction(
  winProbability: number,
  avgWin: number,
  avgLoss: number
): number {
  if (avgLoss <= 0 || avgWin <= 0) return 0;
  if (winProbability <= 0 || winProbability >= 1) return 0;

  const lossProbability = 1 - winProbability;
  const kelly = (winProbability * avgWin - lossProbability * avgLoss) / avgWin;

  // Half-Kelly is common practice for more conservative sizing
  return Math.max(0, Math.min(kelly, 1));
}

/**
 * Risk-reward ratio: Max Loss / Max Profit
 * A ratio of 1:2 means for every ₹1 risked, potential reward is ₹2.
 */
export function riskRewardRatio(maxProfit: number, maxLoss: number): number {
  if (maxLoss === 0) return Infinity;
  if (!isFinite(maxProfit)) return Infinity;
  return Math.abs(maxProfit / maxLoss);
}

/**
 * Optimal position size based on maximum risk per trade.
 *
 * @param capital - Total trading capital
 * @param riskPercent - Max % of capital to risk per trade (default 2%)
 * @param maxLossPerLot - Maximum loss per lot for the strategy
 * @param lotSize - Number of shares per lot
 * @returns Number of lots to trade
 */
export function optimalPositionSize(
  capital: number,
  riskPercent: number,
  maxLossPerLot: number,
  lotSize: number
): { lots: number; totalRisk: number; capitalUsedPercent: number } {
  if (maxLossPerLot <= 0) return { lots: 0, totalRisk: 0, capitalUsedPercent: 0 };

  const maxRisk = capital * (riskPercent / 100);
  const lots = Math.floor(maxRisk / (Math.abs(maxLossPerLot) * lotSize));

  return {
    lots: Math.max(0, lots),
    totalRisk: lots * Math.abs(maxLossPerLot) * lotSize,
    capitalUsedPercent: (lots * Math.abs(maxLossPerLot) * lotSize / capital) * 100,
  };
}
