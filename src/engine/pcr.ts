/**
 * @fileoverview Put-Call Ratio (PCR) Calculator
 *
 * Computes OI-based, volume-based, and change-based PCR with market
 * interpretation and strike-wise breakdown.
 *
 * Interpretation:
 * - PCR > 1.2 → BULLISH (more puts being written → support)
 * - PCR < 0.8 → BEARISH (more calls being written → resistance)
 * - 0.8 ≤ PCR ≤ 1.2 → NEUTRAL
 *
 * @module engine/pcr
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/** Input data for PCR calculation */
export interface PCRStrikeData {
  /** Strike price */
  strike: number;
  /** Call open interest */
  callOI: number;
  /** Put open interest */
  putOI: number;
  /** Call trading volume */
  callVolume: number;
  /** Put trading volume */
  putVolume: number;
  /** Change in call OI from previous session (optional) */
  callOIChange?: number;
  /** Change in put OI from previous session (optional) */
  putOIChange?: number;
}

/** Strike-wise PCR data point */
export interface StrikePCR {
  /** Strike price */
  strike: number;
  /** PCR at this strike (putOI / callOI) */
  pcr: number;
}

/** Market interpretation based on PCR */
export type PCRInterpretation = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/** Complete PCR analysis result */
export interface PCRResult {
  /** OI-based PCR (total put OI / total call OI) */
  oiPCR: number;
  /** Volume-based PCR (total put volume / total call volume) */
  volumePCR: number;
  /** Change-based PCR (total put OI change / total call OI change), null if data unavailable */
  changePCR: number | null;
  /** Market interpretation based on OI PCR */
  interpretation: PCRInterpretation;
  /** Strike-wise PCR breakdown */
  strikewisePCR: StrikePCR[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** PCR above this threshold is considered bullish */
const BULLISH_THRESHOLD = 1.2;
/** PCR below this threshold is considered bearish */
const BEARISH_THRESHOLD = 0.8;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Safely divide two numbers. Returns 0 if denominator is zero.
 */
function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Interpret PCR value into a market signal.
 *
 * Logic:
 * - PCR > 1.2: Heavy put writing indicates support → BULLISH
 * - PCR < 0.8: Heavy call writing indicates resistance → BEARISH
 * - Otherwise: No strong directional bias → NEUTRAL
 *
 * @param pcr - The PCR value to interpret
 * @returns Market interpretation
 */
function interpretPCR(pcr: number): PCRInterpretation {
  if (pcr > BULLISH_THRESHOLD) return 'BULLISH';
  if (pcr < BEARISH_THRESHOLD) return 'BEARISH';
  return 'NEUTRAL';
}

// ─── Core Calculation ────────────────────────────────────────────────────────

/**
 * Calculate comprehensive Put-Call Ratio analysis.
 *
 * Computes three types of PCR:
 * 1. **OI PCR**: Total put OI / Total call OI — the most widely followed metric
 * 2. **Volume PCR**: Total put volume / Total call volume — intraday sentiment
 * 3. **Change PCR**: Net put OI change / Net call OI change — emerging trend
 *
 * Also computes strike-wise PCR for identifying support/resistance clusters.
 *
 * @param optionChainData - Array of strike-level data
 * @returns Complete PCR analysis with interpretation
 *
 * @example
 * const chain = [
 *   { strike: 24400, callOI: 1500000, putOI: 500000, callVolume: 50000, putVolume: 30000 },
 *   { strike: 24500, callOI: 2000000, putOI: 3000000, callVolume: 80000, putVolume: 100000 },
 *   { strike: 24600, callOI: 1000000, putOI: 2500000, callVolume: 40000, putVolume: 60000 },
 * ];
 * const pcr = calculatePCR(chain);
 * // pcr.oiPCR → 1.333 (bullish: more put OI than call OI)
 */
export function calculatePCR(
  optionChainData: PCRStrikeData[]
): PCRResult {
  if (optionChainData.length === 0) {
    return {
      oiPCR: 0,
      volumePCR: 0,
      changePCR: null,
      interpretation: 'NEUTRAL',
      strikewisePCR: [],
    };
  }

  let totalCallOI = 0;
  let totalPutOI = 0;
  let totalCallVolume = 0;
  let totalPutVolume = 0;
  let totalCallOIChange = 0;
  let totalPutOIChange = 0;
  let hasChangeData = false;

  const strikewisePCR: StrikePCR[] = [];

  for (const row of optionChainData) {
    totalCallOI += row.callOI;
    totalPutOI += row.putOI;
    totalCallVolume += row.callVolume;
    totalPutVolume += row.putVolume;

    if (row.callOIChange !== undefined && row.putOIChange !== undefined) {
      totalCallOIChange += row.callOIChange;
      totalPutOIChange += row.putOIChange;
      hasChangeData = true;
    }

    // Strike-wise PCR (only for strikes with meaningful OI)
    if (row.callOI > 0 || row.putOI > 0) {
      strikewisePCR.push({
        strike: row.strike,
        pcr: safeDivide(row.putOI, row.callOI),
      });
    }
  }

  const oiPCR = safeDivide(totalPutOI, totalCallOI);
  const volumePCR = safeDivide(totalPutVolume, totalCallVolume);

  let changePCR: number | null = null;
  if (hasChangeData && totalCallOIChange !== 0) {
    changePCR = safeDivide(totalPutOIChange, totalCallOIChange);
  }

  // Sort strike-wise PCR by strike
  strikewisePCR.sort((a, b) => a.strike - b.strike);

  return {
    oiPCR,
    volumePCR,
    changePCR,
    interpretation: interpretPCR(oiPCR),
    strikewisePCR,
  };
}
