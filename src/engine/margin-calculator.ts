/**
 * @module engine/margin-calculator
 * Simplified SPAN-like margin estimation for Indian options trading.
 * Uses NSE's margin framework to estimate initial + exposure margin.
 *
 * NOTE: This is an estimation. Actual margins are computed by the exchange
 * using the full 16-scenario SPAN methodology. Use this for planning only.
 */

export interface MarginEstimate {
  spanMargin: number;
  exposureMargin: number;
  totalMargin: number;
  premiumReceived: number;
  netMarginRequired: number;
  marginBenefit: number;
  breakdown: Array<{ description: string; margin: number }>;
}

export interface MarginLeg {
  type: 'CE' | 'PE';
  strike: number;
  premium: number;
  qty: number;
  action: 'BUY' | 'SELL';
}

/**
 * Estimate margin for an options position.
 *
 * Margin rules (simplified):
 * - Buying options: Only premium is required (no margin)
 * - Selling naked options: SPAN + Exposure
 *   - SPAN ≈ max(premium + OTM amount, premium + 5% of underlying) for rough estimate
 *   - Exposure ≈ 2-3% of notional for indices, 3.5% for stocks
 * - Spreads: max loss of the spread
 * - Multi-leg: Margin benefit from hedging
 *
 * @param legs - Array of position legs
 * @param spotPrice - Current underlying price
 * @param lotSize - Lot size for the instrument
 * @param iv - Current IV (decimal, used for SPAN estimation)
 */
export function estimateMargin(
  legs: MarginLeg[],
  spotPrice: number,
  lotSize: number,
  iv: number = 0.15
): MarginEstimate {
  const notional = spotPrice * lotSize;
  const breakdown: Array<{ description: string; margin: number }> = [];

  const buyLegs = legs.filter(l => l.action === 'BUY');
  const sellLegs = legs.filter(l => l.action === 'SELL');

  // Premium calculations
  const premiumReceived = sellLegs.reduce((sum, l) => sum + l.premium * l.qty * lotSize, 0);
  const premiumPaid = buyLegs.reduce((sum, l) => sum + l.premium * l.qty * lotSize, 0);

  // If only buying: just premium required
  if (sellLegs.length === 0) {
    return {
      spanMargin: 0,
      exposureMargin: 0,
      totalMargin: premiumPaid,
      premiumReceived: 0,
      netMarginRequired: premiumPaid,
      marginBenefit: 0,
      breakdown: [{ description: 'Premium paid (no margin required)', margin: premiumPaid }],
    };
  }

  // Check if it's a spread (hedged position)
  const isSpread = detectSpreadType(legs);

  if (isSpread.isSpread) {
    // Spread margin = max loss of the spread
    const maxLoss = calculateSpreadMaxLoss(legs, spotPrice, lotSize);

    breakdown.push({ description: `Spread margin (${isSpread.type})`, margin: maxLoss });

    const nakedMargin = estimateNakedMargins(sellLegs, spotPrice, lotSize, iv);
    const benefit = nakedMargin - maxLoss;

    return {
      spanMargin: maxLoss * 0.75,
      exposureMargin: maxLoss * 0.25,
      totalMargin: maxLoss,
      premiumReceived,
      netMarginRequired: maxLoss,
      marginBenefit: Math.max(0, benefit),
      breakdown,
    };
  }

  // Naked option selling
  let totalSpan = 0;
  let totalExposure = 0;

  for (const leg of sellLegs) {
    const legNotional = spotPrice * leg.qty * lotSize;

    // SPAN estimation: Higher of two formulas
    const otmAmount = leg.type === 'CE'
      ? Math.max(0, spotPrice - leg.strike)
      : Math.max(0, leg.strike - spotPrice);

    // Formula 1: Premium + OTM loss
    const span1 = (leg.premium * leg.qty * lotSize) +
      (otmAmount * leg.qty * lotSize) +
      (legNotional * iv * 0.5); // volatility component

    // Formula 2: Minimum 5% of notional
    const span2 = legNotional * 0.05;

    const spanMargin = Math.max(span1, span2);

    // Exposure: 2-3% for indices, 3.5% for stocks
    const exposureMargin = legNotional * 0.03;

    totalSpan += spanMargin;
    totalExposure += exposureMargin;

    breakdown.push({
      description: `SELL ${leg.qty}x ${leg.type} ${leg.strike}`,
      margin: spanMargin + exposureMargin,
    });
  }

  // Reduce margin for buy legs (hedging benefit)
  let hedgeBenefit = 0;
  for (const buyLeg of buyLegs) {
    // Each buy leg provides protection, reducing margin
    hedgeBenefit += buyLeg.premium * buyLeg.qty * lotSize * 2; // Simplified benefit
  }

  totalSpan = Math.max(totalSpan - hedgeBenefit, 0);

  const totalMargin = totalSpan + totalExposure;

  return {
    spanMargin: totalSpan,
    exposureMargin: totalExposure,
    totalMargin,
    premiumReceived,
    netMarginRequired: totalMargin,
    marginBenefit: hedgeBenefit,
    breakdown,
  };
}

function detectSpreadType(legs: MarginLeg[]): { isSpread: boolean; type: string } {
  if (legs.length !== 2) {
    // Check for 4-leg spreads (iron condor, iron butterfly)
    if (legs.length === 4) {
      const buys = legs.filter(l => l.action === 'BUY');
      const sells = legs.filter(l => l.action === 'SELL');
      if (buys.length === 2 && sells.length === 2) {
        return { isSpread: true, type: 'Iron Spread' };
      }
    }
    // 3-leg butterfly
    if (legs.length === 3) {
      return { isSpread: true, type: 'Butterfly' };
    }
    return { isSpread: false, type: '' };
  }

  const [leg1, leg2] = legs;

  // Same type, different actions = vertical spread
  if (leg1.type === leg2.type && leg1.action !== leg2.action) {
    const buyLeg = leg1.action === 'BUY' ? leg1 : leg2;
    const sellLeg = leg1.action === 'SELL' ? leg1 : leg2;

    if (leg1.type === 'CE') {
      return {
        isSpread: true,
        type: buyLeg.strike < sellLeg.strike ? 'Bull Call Spread' : 'Bear Call Spread',
      };
    } else {
      return {
        isSpread: true,
        type: buyLeg.strike > sellLeg.strike ? 'Bear Put Spread' : 'Bull Put Spread',
      };
    }
  }

  // Different types, same action = straddle/strangle
  if (leg1.type !== leg2.type && leg1.action === leg2.action) {
    if (leg1.action === 'SELL') {
      return {
        isSpread: true,
        type: leg1.strike === leg2.strike ? 'Short Straddle' : 'Short Strangle',
      };
    }
  }

  return { isSpread: false, type: '' };
}

function calculateSpreadMaxLoss(legs: MarginLeg[], spotPrice: number, lotSize: number): number {
  // Calculate max loss by finding worst-case payoff
  const strikes = legs.map(l => l.strike);
  const allPrices = [
    Math.min(...strikes) - spotPrice * 0.1,
    ...strikes,
    Math.max(...strikes) + spotPrice * 0.1,
  ];

  let maxLoss = 0;

  for (const price of allPrices) {
    let pnl = 0;
    for (const leg of legs) {
      let intrinsic = 0;
      if (leg.type === 'CE') {
        intrinsic = Math.max(0, price - leg.strike);
      } else {
        intrinsic = Math.max(0, leg.strike - price);
      }
      const direction = leg.action === 'BUY' ? 1 : -1;
      pnl += direction * (intrinsic - leg.premium) * leg.qty * lotSize;
    }
    maxLoss = Math.min(maxLoss, pnl);
  }

  return Math.abs(maxLoss);
}

function estimateNakedMargins(
  sellLegs: MarginLeg[],
  spotPrice: number,
  lotSize: number,
  iv: number
): number {
  let total = 0;
  for (const leg of sellLegs) {
    const notional = spotPrice * leg.qty * lotSize;
    const spanEst = notional * Math.max(0.05, iv * 0.5);
    const exposureEst = notional * 0.03;
    total += spanEst + exposureEst;
  }
  return total;
}
