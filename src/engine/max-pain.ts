/**
 * @fileoverview Max Pain Calculator
 *
 * Computes the "max pain" strike — the price at which total option writer
 * payout is minimized (equivalently, total option buyer pain is maximized).
 *
 * Theory: The max pain theory suggests that the underlying tends to gravitate
 * toward the strike price where the total value of outstanding options
 * (open interest × intrinsic value) is minimized at expiry.
 *
 * Algorithm: For each potential settlement price S, calculate the total
 * intrinsic value payout across all strikes. The max pain strike is the S
 * that minimizes this total payout.
 *
 * @module engine/max-pain
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Input data for a single strike in the option chain */
export interface MaxPainStrikeData {
  /** Strike price */
  strike: number;
  /** Open interest for call options at this strike */
  callOI: number;
  /** Open interest for put options at this strike */
  putOI: number;
}

/** Pain breakdown for a single strike as settlement price */
export interface PainByStrike {
  /** The strike being evaluated as potential settlement */
  strike: number;
  /** Total pain (call pain + put pain) if underlying settles here */
  totalPain: number;
  /** Total call writer payout */
  callPain: number;
  /** Total put writer payout */
  putPain: number;
}

/** Complete max pain analysis result */
export interface MaxPainResult {
  /** The strike with minimum total writer payout */
  maxPainStrike: number;
  /** Pain breakdown for each potential settlement price */
  painByStrike: PainByStrike[];
}

// ─── Core Calculation ────────────────────────────────────────────────────────

/**
 * Calculate the max pain strike for a given option chain.
 *
 * For each potential settlement price S (using each available strike):
 * - Call pain at strike K = max(S - K, 0) × callOI × lotSize
 * - Put pain at strike K = max(K - S, 0) × putOI × lotSize
 *
 * Total pain = Σ(call pain + put pain) across all strikes.
 * Max pain = S that minimizes total pain.
 *
 * @param optionChainData - Array of {strike, callOI, putOI} for the expiry
 * @param lotSize - Lot size (e.g. 25 for NIFTY, 15 for BANKNIFTY)
 * @returns Max pain strike and detailed pain breakdown
 *
 * @example
 * const chain = [
 *   { strike: 24400, callOI: 1500000, putOI: 500000 },
 *   { strike: 24500, callOI: 2000000, putOI: 1800000 },
 *   { strike: 24600, callOI: 1000000, putOI: 2500000 },
 * ];
 * const result = calculateMaxPain(chain, 25);
 * // result.maxPainStrike → 24500 (where total payout is minimized)
 */
export function calculateMaxPain(
  optionChainData: MaxPainStrikeData[],
  lotSize: number
): MaxPainResult {
  if (optionChainData.length === 0) {
    return {
      maxPainStrike: 0,
      painByStrike: [],
    };
  }

  // Sort strikes for consistent output
  const sortedData = [...optionChainData].sort((a, b) => a.strike - b.strike);

  // Filter out strikes with zero OI on both sides (they don't contribute)
  const activeStrikes = sortedData.filter(
    (d) => d.callOI > 0 || d.putOI > 0
  );

  if (activeStrikes.length === 0) {
    return {
      maxPainStrike: sortedData[Math.floor(sortedData.length / 2)].strike,
      painByStrike: sortedData.map((d) => ({
        strike: d.strike,
        totalPain: 0,
        callPain: 0,
        putPain: 0,
      })),
    };
  }

  const painByStrike: PainByStrike[] = [];
  let minPain = Infinity;
  let maxPainStrike = activeStrikes[0].strike;

  // For each potential settlement price (evaluate at each available strike)
  for (const settlementData of sortedData) {
    const S = settlementData.strike;
    let totalCallPain = 0;
    let totalPutPain = 0;

    // Calculate pain across ALL strikes if underlying settles at S
    for (const strikeData of activeStrikes) {
      const K = strikeData.strike;

      // Call writer payout: if S > K, each call is worth (S - K)
      if (S > K) {
        totalCallPain += (S - K) * strikeData.callOI * lotSize;
      }

      // Put writer payout: if S < K, each put is worth (K - S)
      if (S < K) {
        totalPutPain += (K - S) * strikeData.putOI * lotSize;
      }
    }

    const totalPain = totalCallPain + totalPutPain;
    painByStrike.push({
      strike: S,
      totalPain,
      callPain: totalCallPain,
      putPain: totalPutPain,
    });

    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = S;
    }
  }

  return {
    maxPainStrike,
    painByStrike,
  };
}
