/**
 * @module engine/strategy-builder
 * Complete options strategy builder with 34 pre-defined strategies.
 * Each strategy auto-constructs legs relative to ATM strike with real market data.
 */

/** Strategy leg definition */
export interface StrategyLeg {
  type: 'CE' | 'PE';
  strike: number;
  premium: number;
  qty: number;
  action: 'BUY' | 'SELL';
  expiry: string;
}

/** Parameters for building a strategy */
export interface StrategyParams {
  spotPrice: number;
  atmStrike: number;
  strikeInterval: number;
  expiry: string;
  premiums?: Map<string, number>; // key: "strike-CE" or "strike-PE"
  otmOffset?: number;
  customStrikes?: number[];
}

/** Strategy template definition */
export interface StrategyTemplate {
  name: string;
  displayName: string;
  category: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILITY';
  description: string;
  outlook: string;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';
  legCount: number;
  maxProfit: string;
  maxLoss: string;
  breakeven: string;
  idealConditions: string;
  buildLegs: (params: StrategyParams) => StrategyLeg[];
}

function getPremium(params: StrategyParams, strike: number, type: 'CE' | 'PE'): number {
  if (params.premiums) {
    return params.premiums.get(`${strike}-${type}`) ?? 0;
  }
  return 0;
}

function leg(
  type: 'CE' | 'PE', strike: number, action: 'BUY' | 'SELL',
  qty: number, premium: number, expiry: string
): StrategyLeg {
  return { type, strike, action, qty, premium, expiry };
}

// ─── STRATEGY DEFINITIONS ───────────────────────────────────────

export const STRATEGIES: Record<string, StrategyTemplate> = {

  // ════════════════════ BULLISH ════════════════════

  long_call: {
    name: 'long_call', displayName: 'Long Call',
    category: 'BULLISH', riskLevel: 'MODERATE', legCount: 1,
    description: 'Buy a call option to profit from upward price movement.',
    outlook: 'Strongly bullish — expecting significant upward move',
    maxProfit: 'Unlimited', maxLoss: 'Premium paid',
    breakeven: 'Strike + Premium', idealConditions: 'Strong bullish conviction, rising IV',
    buildLegs: (p) => [
      leg('CE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
    ],
  },

  bull_call_spread: {
    name: 'bull_call_spread', displayName: 'Bull Call Spread',
    category: 'BULLISH', riskLevel: 'LOW', legCount: 2,
    description: 'Buy lower strike call, sell higher strike call. Caps both profit and loss.',
    outlook: 'Moderately bullish — expecting modest upside',
    maxProfit: '(Higher Strike - Lower Strike) - Net Debit',
    maxLoss: 'Net Debit paid',
    breakeven: 'Lower Strike + Net Debit',
    idealConditions: 'Moderate bullish view, want defined risk',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
        leg('CE', p.atmStrike + offset, 'SELL', 1, getPremium(p, p.atmStrike + offset, 'CE'), p.expiry),
      ];
    },
  },

  bull_put_spread: {
    name: 'bull_put_spread', displayName: 'Bull Put Spread (Credit)',
    category: 'BULLISH', riskLevel: 'LOW', legCount: 2,
    description: 'Sell higher strike put, buy lower strike put. Collect credit upfront.',
    outlook: 'Neutral to bullish — expecting price to stay above short put',
    maxProfit: 'Net Credit received',
    maxLoss: '(Higher Strike - Lower Strike) - Net Credit',
    breakeven: 'Higher Strike - Net Credit',
    idealConditions: 'Bullish or neutral, want to collect premium, high IV',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('PE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
        leg('PE', p.atmStrike - offset, 'BUY', 1, getPremium(p, p.atmStrike - offset, 'PE'), p.expiry),
      ];
    },
  },

  call_ratio_backspread: {
    name: 'call_ratio_backspread', displayName: 'Call Ratio Backspread',
    category: 'BULLISH', riskLevel: 'MODERATE', legCount: 2,
    description: 'Sell 1 lower call, buy 2 higher calls. Profits from big upside moves.',
    outlook: 'Very bullish — expecting explosive upside',
    maxProfit: 'Unlimited', maxLoss: '(Higher - Lower Strike) - Net Credit/+ Net Debit',
    breakeven: 'Higher Strike + Max Loss', idealConditions: 'Expecting big breakout, rising IV',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
        leg('CE', p.atmStrike + offset, 'BUY', 2, getPremium(p, p.atmStrike + offset, 'CE'), p.expiry),
      ];
    },
  },

  synthetic_long: {
    name: 'synthetic_long', displayName: 'Synthetic Long Futures',
    category: 'BULLISH', riskLevel: 'VERY_HIGH', legCount: 2,
    description: 'Buy call + sell put at same strike. Mimics long futures position.',
    outlook: 'Strongly bullish — equivalent to futures position',
    maxProfit: 'Unlimited', maxLoss: 'Strike - Net Credit (if any)',
    breakeven: 'Strike + Net Debit', idealConditions: 'Strong directional conviction',
    buildLegs: (p) => [
      leg('CE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
      leg('PE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
    ],
  },

  // ════════════════════ BEARISH ════════════════════

  long_put: {
    name: 'long_put', displayName: 'Long Put',
    category: 'BEARISH', riskLevel: 'MODERATE', legCount: 1,
    description: 'Buy a put option to profit from downward price movement.',
    outlook: 'Strongly bearish — expecting significant downside',
    maxProfit: 'Strike - Premium (if underlying goes to 0)', maxLoss: 'Premium paid',
    breakeven: 'Strike - Premium', idealConditions: 'Strong bearish conviction',
    buildLegs: (p) => [
      leg('PE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
    ],
  },

  bear_put_spread: {
    name: 'bear_put_spread', displayName: 'Bear Put Spread',
    category: 'BEARISH', riskLevel: 'LOW', legCount: 2,
    description: 'Buy higher strike put, sell lower strike put.',
    outlook: 'Moderately bearish — expecting modest downside',
    maxProfit: '(Higher Strike - Lower Strike) - Net Debit',
    maxLoss: 'Net Debit paid', breakeven: 'Higher Strike - Net Debit',
    idealConditions: 'Moderate bearish view, defined risk',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('PE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
        leg('PE', p.atmStrike - offset, 'SELL', 1, getPremium(p, p.atmStrike - offset, 'PE'), p.expiry),
      ];
    },
  },

  bear_call_spread: {
    name: 'bear_call_spread', displayName: 'Bear Call Spread (Credit)',
    category: 'BEARISH', riskLevel: 'LOW', legCount: 2,
    description: 'Sell lower strike call, buy higher strike call. Collect credit.',
    outlook: 'Neutral to bearish — expecting price stays below short call',
    maxProfit: 'Net Credit received',
    maxLoss: '(Higher Strike - Lower Strike) - Net Credit',
    breakeven: 'Lower Strike + Net Credit',
    idealConditions: 'Bearish or neutral, want to collect premium, high IV',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
        leg('CE', p.atmStrike + offset, 'BUY', 1, getPremium(p, p.atmStrike + offset, 'CE'), p.expiry),
      ];
    },
  },

  put_ratio_backspread: {
    name: 'put_ratio_backspread', displayName: 'Put Ratio Backspread',
    category: 'BEARISH', riskLevel: 'MODERATE', legCount: 2,
    description: 'Sell 1 higher put, buy 2 lower puts. Profits from big downside.',
    outlook: 'Very bearish — expecting crash or large drop',
    maxProfit: 'Lower Strike - Net Cost (large)', maxLoss: '(Higher - Lower Strike) + Net Debit',
    breakeven: 'Lower Strike - Max Loss', idealConditions: 'Expecting major decline, rising IV',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('PE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
        leg('PE', p.atmStrike - offset, 'BUY', 2, getPremium(p, p.atmStrike - offset, 'PE'), p.expiry),
      ];
    },
  },

  synthetic_short: {
    name: 'synthetic_short', displayName: 'Synthetic Short Futures',
    category: 'BEARISH', riskLevel: 'VERY_HIGH', legCount: 2,
    description: 'Buy put + sell call at same strike. Mimics short futures.',
    outlook: 'Strongly bearish', maxProfit: 'Strike - Net Debit',
    maxLoss: 'Unlimited', breakeven: 'Strike - Net Debit',
    idealConditions: 'Strong bearish conviction',
    buildLegs: (p) => [
      leg('PE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
      leg('CE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
    ],
  },

  // ════════════════════ NEUTRAL ════════════════════

  short_straddle: {
    name: 'short_straddle', displayName: 'Short Straddle',
    category: 'NEUTRAL', riskLevel: 'VERY_HIGH', legCount: 2,
    description: 'Sell ATM call + ATM put. Maximum profit if underlying stays at strike.',
    outlook: 'Neutral — expecting very low volatility, price stays pinned',
    maxProfit: 'Total Premium received', maxLoss: 'Unlimited',
    breakeven: 'Strike ± Total Premium',
    idealConditions: 'Very high IV (overpriced options), range-bound market, post-event',
    buildLegs: (p) => [
      leg('CE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
      leg('PE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
    ],
  },

  short_strangle: {
    name: 'short_strangle', displayName: 'Short Strangle',
    category: 'NEUTRAL', riskLevel: 'VERY_HIGH', legCount: 2,
    description: 'Sell OTM call + OTM put. Wider profit zone than straddle.',
    outlook: 'Neutral — expecting price stays in range',
    maxProfit: 'Total Premium received', maxLoss: 'Unlimited',
    breakeven: 'Call Strike + Premium / Put Strike - Premium',
    idealConditions: 'High IV, expecting range-bound, time decay favored',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 3) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike + offset, 'SELL', 1, getPremium(p, p.atmStrike + offset, 'CE'), p.expiry),
        leg('PE', p.atmStrike - offset, 'SELL', 1, getPremium(p, p.atmStrike - offset, 'PE'), p.expiry),
      ];
    },
  },

  iron_condor: {
    name: 'iron_condor', displayName: 'Iron Condor',
    category: 'NEUTRAL', riskLevel: 'LOW', legCount: 4,
    description: 'Sell OTM strangle + buy further OTM wings for protection. Defined risk.',
    outlook: 'Neutral — expecting price stays in a defined range',
    maxProfit: 'Net Credit received',
    maxLoss: 'Width of wider spread - Net Credit',
    breakeven: 'Short Call + Credit / Short Put - Credit',
    idealConditions: 'High IV, range-bound, time decay environment',
    buildLegs: (p) => {
      const innerOffset = (p.otmOffset ?? 3) * p.strikeInterval;
      const outerOffset = innerOffset + 2 * p.strikeInterval;
      return [
        leg('PE', p.atmStrike - outerOffset, 'BUY', 1, getPremium(p, p.atmStrike - outerOffset, 'PE'), p.expiry),
        leg('PE', p.atmStrike - innerOffset, 'SELL', 1, getPremium(p, p.atmStrike - innerOffset, 'PE'), p.expiry),
        leg('CE', p.atmStrike + innerOffset, 'SELL', 1, getPremium(p, p.atmStrike + innerOffset, 'CE'), p.expiry),
        leg('CE', p.atmStrike + outerOffset, 'BUY', 1, getPremium(p, p.atmStrike + outerOffset, 'CE'), p.expiry),
      ];
    },
  },

  iron_butterfly: {
    name: 'iron_butterfly', displayName: 'Iron Butterfly',
    category: 'NEUTRAL', riskLevel: 'LOW', legCount: 4,
    description: 'Sell ATM straddle + buy OTM wings. Higher credit than iron condor.',
    outlook: 'Strongly neutral — expecting price stays exactly at strike',
    maxProfit: 'Net Credit received',
    maxLoss: 'Wing width - Net Credit',
    breakeven: 'ATM Strike ± Net Credit',
    idealConditions: 'Very high IV, expecting minimal movement, post-event plays',
    buildLegs: (p) => {
      const wingOffset = (p.otmOffset ?? 4) * p.strikeInterval;
      return [
        leg('PE', p.atmStrike - wingOffset, 'BUY', 1, getPremium(p, p.atmStrike - wingOffset, 'PE'), p.expiry),
        leg('PE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
        leg('CE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
        leg('CE', p.atmStrike + wingOffset, 'BUY', 1, getPremium(p, p.atmStrike + wingOffset, 'CE'), p.expiry),
      ];
    },
  },

  jade_lizard: {
    name: 'jade_lizard', displayName: 'Jade Lizard',
    category: 'NEUTRAL', riskLevel: 'MODERATE', legCount: 3,
    description: 'Sell OTM put + sell OTM call + buy further OTM call. No upside risk if credit > call spread width.',
    outlook: 'Neutral to slightly bullish',
    maxProfit: 'Net Credit (if price between short strikes)',
    maxLoss: 'Short Put Strike - Net Credit (downside only)',
    breakeven: 'Short Put Strike - Net Credit',
    idealConditions: 'High IV, bullish bias, want to eliminate upside risk',
    buildLegs: (p) => {
      const putOffset = (p.otmOffset ?? 3) * p.strikeInterval;
      const callOffset1 = (p.otmOffset ?? 2) * p.strikeInterval;
      const callOffset2 = callOffset1 + 2 * p.strikeInterval;
      return [
        leg('PE', p.atmStrike - putOffset, 'SELL', 1, getPremium(p, p.atmStrike - putOffset, 'PE'), p.expiry),
        leg('CE', p.atmStrike + callOffset1, 'SELL', 1, getPremium(p, p.atmStrike + callOffset1, 'CE'), p.expiry),
        leg('CE', p.atmStrike + callOffset2, 'BUY', 1, getPremium(p, p.atmStrike + callOffset2, 'CE'), p.expiry),
      ];
    },
  },

  short_guts: {
    name: 'short_guts', displayName: 'Short Guts',
    category: 'NEUTRAL', riskLevel: 'VERY_HIGH', legCount: 2,
    description: 'Sell ITM call + ITM put. Higher premium but higher risk than strangle.',
    outlook: 'Neutral — expecting price stays between strikes',
    maxProfit: 'Total Premium - (Call Strike - Put Strike)',
    maxLoss: 'Unlimited', breakeven: 'Call Strike + Net Credit / Put Strike - Net Credit',
    idealConditions: 'Very high IV environment',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike - offset, 'SELL', 1, getPremium(p, p.atmStrike - offset, 'CE'), p.expiry),
        leg('PE', p.atmStrike + offset, 'SELL', 1, getPremium(p, p.atmStrike + offset, 'PE'), p.expiry),
      ];
    },
  },

  // ════════════════════ VOLATILITY ════════════════════

  long_straddle: {
    name: 'long_straddle', displayName: 'Long Straddle',
    category: 'VOLATILITY', riskLevel: 'MODERATE', legCount: 2,
    description: 'Buy ATM call + ATM put. Profits from big move in either direction.',
    outlook: 'Expecting high volatility / big move, direction unknown',
    maxProfit: 'Unlimited', maxLoss: 'Total Premium paid',
    breakeven: 'Strike ± Total Premium',
    idealConditions: 'Pre-event (earnings, budget, RBI policy), low IV',
    buildLegs: (p) => [
      leg('CE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
      leg('PE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
    ],
  },

  long_strangle: {
    name: 'long_strangle', displayName: 'Long Strangle',
    category: 'VOLATILITY', riskLevel: 'MODERATE', legCount: 2,
    description: 'Buy OTM call + OTM put. Cheaper than straddle but needs bigger move.',
    outlook: 'Expecting very large move in either direction',
    maxProfit: 'Unlimited', maxLoss: 'Total Premium paid',
    breakeven: 'Call Strike + Premium / Put Strike - Premium',
    idealConditions: 'Major event expected, IV still low',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 3) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike + offset, 'BUY', 1, getPremium(p, p.atmStrike + offset, 'CE'), p.expiry),
        leg('PE', p.atmStrike - offset, 'BUY', 1, getPremium(p, p.atmStrike - offset, 'PE'), p.expiry),
      ];
    },
  },

  long_guts: {
    name: 'long_guts', displayName: 'Long Guts',
    category: 'VOLATILITY', riskLevel: 'HIGH', legCount: 2,
    description: 'Buy ITM call + ITM put. More expensive but higher delta from start.',
    outlook: 'Expecting extreme volatility',
    maxProfit: 'Unlimited', maxLoss: 'Premium - (Call Strike - Put Strike)',
    breakeven: 'Call Strike + Premium / Put Strike - Premium',
    idealConditions: 'Extreme volatility expected',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike - offset, 'BUY', 1, getPremium(p, p.atmStrike - offset, 'CE'), p.expiry),
        leg('PE', p.atmStrike + offset, 'BUY', 1, getPremium(p, p.atmStrike + offset, 'PE'), p.expiry),
      ];
    },
  },

  reverse_iron_condor: {
    name: 'reverse_iron_condor', displayName: 'Reverse Iron Condor',
    category: 'VOLATILITY', riskLevel: 'LOW', legCount: 4,
    description: 'Buy inner strangle + sell outer strangle. Defined risk volatility play.',
    outlook: 'Expecting large move, want capped risk',
    maxProfit: 'Width of wider spread - Net Debit',
    maxLoss: 'Net Debit paid',
    breakeven: 'Inner strikes ± Net Debit',
    idealConditions: 'Pre-event, low IV, expecting breakout',
    buildLegs: (p) => {
      const innerOffset = (p.otmOffset ?? 2) * p.strikeInterval;
      const outerOffset = innerOffset + 2 * p.strikeInterval;
      return [
        leg('PE', p.atmStrike - outerOffset, 'SELL', 1, getPremium(p, p.atmStrike - outerOffset, 'PE'), p.expiry),
        leg('PE', p.atmStrike - innerOffset, 'BUY', 1, getPremium(p, p.atmStrike - innerOffset, 'PE'), p.expiry),
        leg('CE', p.atmStrike + innerOffset, 'BUY', 1, getPremium(p, p.atmStrike + innerOffset, 'CE'), p.expiry),
        leg('CE', p.atmStrike + outerOffset, 'SELL', 1, getPremium(p, p.atmStrike + outerOffset, 'CE'), p.expiry),
      ];
    },
  },

  // ════════════════════ SPREADS ════════════════════

  long_call_butterfly: {
    name: 'long_call_butterfly', displayName: 'Long Call Butterfly',
    category: 'NEUTRAL', riskLevel: 'LOW', legCount: 3,
    description: 'Buy 1 lower call + sell 2 middle calls + buy 1 upper call.',
    outlook: 'Expecting price at middle strike at expiry',
    maxProfit: '(Middle - Lower Strike) - Net Debit',
    maxLoss: 'Net Debit', breakeven: 'Lower + Debit / Upper - Debit',
    idealConditions: 'Low vol, tight range, cheap entry',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 3) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike - offset, 'BUY', 1, getPremium(p, p.atmStrike - offset, 'CE'), p.expiry),
        leg('CE', p.atmStrike, 'SELL', 2, getPremium(p, p.atmStrike, 'CE'), p.expiry),
        leg('CE', p.atmStrike + offset, 'BUY', 1, getPremium(p, p.atmStrike + offset, 'CE'), p.expiry),
      ];
    },
  },

  long_put_butterfly: {
    name: 'long_put_butterfly', displayName: 'Long Put Butterfly',
    category: 'NEUTRAL', riskLevel: 'LOW', legCount: 3,
    description: 'Buy 1 lower put + sell 2 middle puts + buy 1 upper put.',
    outlook: 'Expecting price at middle strike at expiry',
    maxProfit: '(Middle - Lower Strike) - Net Debit',
    maxLoss: 'Net Debit', breakeven: 'Lower + Debit / Upper - Debit',
    idealConditions: 'Same as call butterfly',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 3) * p.strikeInterval;
      return [
        leg('PE', p.atmStrike - offset, 'BUY', 1, getPremium(p, p.atmStrike - offset, 'PE'), p.expiry),
        leg('PE', p.atmStrike, 'SELL', 2, getPremium(p, p.atmStrike, 'PE'), p.expiry),
        leg('PE', p.atmStrike + offset, 'BUY', 1, getPremium(p, p.atmStrike + offset, 'PE'), p.expiry),
      ];
    },
  },

  condor_spread: {
    name: 'condor_spread', displayName: 'Condor Spread',
    category: 'NEUTRAL', riskLevel: 'LOW', legCount: 4,
    description: 'Like butterfly but with 4 different strikes for wider profit zone.',
    outlook: 'Expecting price stays in wider range than butterfly',
    maxProfit: '(K2 - K1) - Net Debit', maxLoss: 'Net Debit',
    breakeven: 'K1 + Debit / K4 - Debit',
    idealConditions: 'Range-bound with some room for movement',
    buildLegs: (p) => {
      const s = p.strikeInterval;
      return [
        leg('CE', p.atmStrike - 2 * s, 'BUY', 1, getPremium(p, p.atmStrike - 2 * s, 'CE'), p.expiry),
        leg('CE', p.atmStrike - 1 * s, 'SELL', 1, getPremium(p, p.atmStrike - 1 * s, 'CE'), p.expiry),
        leg('CE', p.atmStrike + 1 * s, 'SELL', 1, getPremium(p, p.atmStrike + 1 * s, 'CE'), p.expiry),
        leg('CE', p.atmStrike + 2 * s, 'BUY', 1, getPremium(p, p.atmStrike + 2 * s, 'CE'), p.expiry),
      ];
    },
  },

  box_spread: {
    name: 'box_spread', displayName: 'Box Spread',
    category: 'NEUTRAL', riskLevel: 'LOW', legCount: 4,
    description: 'Bull call spread + bear put spread at same strikes. Arbitrage strategy.',
    outlook: 'Market-neutral — used for arbitrage or synthetic lending/borrowing',
    maxProfit: '(K2 - K1) × e^(-rT) - Net Debit', maxLoss: 'Net Debit if mispriced',
    breakeven: 'N/A (value = K2 - K1 at expiry)',
    idealConditions: 'Mispricing between call and put spreads',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 3) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
        leg('CE', p.atmStrike + offset, 'SELL', 1, getPremium(p, p.atmStrike + offset, 'CE'), p.expiry),
        leg('PE', p.atmStrike + offset, 'BUY', 1, getPremium(p, p.atmStrike + offset, 'PE'), p.expiry),
        leg('PE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
      ];
    },
  },

  collar: {
    name: 'collar', displayName: 'Collar',
    category: 'NEUTRAL', riskLevel: 'LOW', legCount: 2,
    description: 'Buy OTM put + sell OTM call. Protects existing long position.',
    outlook: 'Protective — limit downside while capping upside on existing position',
    maxProfit: 'Call Strike - Current Price + Net Credit/Debit',
    maxLoss: 'Current Price - Put Strike + Net Debit', breakeven: 'Current Price + Net Debit',
    idealConditions: 'Have existing long position, want cheap protection',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 3) * p.strikeInterval;
      return [
        leg('PE', p.atmStrike - offset, 'BUY', 1, getPremium(p, p.atmStrike - offset, 'PE'), p.expiry),
        leg('CE', p.atmStrike + offset, 'SELL', 1, getPremium(p, p.atmStrike + offset, 'CE'), p.expiry),
      ];
    },
  },

  covered_call: {
    name: 'covered_call', displayName: 'Covered Call',
    category: 'NEUTRAL', riskLevel: 'LOW', legCount: 1,
    description: 'Sell OTM call against existing long stock/futures position.',
    outlook: 'Neutral to slightly bullish — income generation',
    maxProfit: '(Strike - Entry) + Premium', maxLoss: 'Entry - Premium',
    breakeven: 'Entry Price - Premium',
    idealConditions: 'Own the underlying, sideways market, high IV',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike + offset, 'SELL', 1, getPremium(p, p.atmStrike + offset, 'CE'), p.expiry),
      ];
    },
  },

  protective_put: {
    name: 'protective_put', displayName: 'Protective Put',
    category: 'BULLISH', riskLevel: 'LOW', legCount: 1,
    description: 'Buy put to protect existing long position. Insurance strategy.',
    outlook: 'Bullish with downside protection',
    maxProfit: 'Unlimited (minus premium)', maxLoss: '(Entry - Strike) + Premium',
    breakeven: 'Entry + Premium',
    idealConditions: 'Have long position, worried about downside',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('PE', p.atmStrike - offset, 'BUY', 1, getPremium(p, p.atmStrike - offset, 'PE'), p.expiry),
      ];
    },
  },

  strip: {
    name: 'strip', displayName: 'Strip',
    category: 'BEARISH', riskLevel: 'MODERATE', legCount: 2,
    description: 'Buy 1 ATM call + 2 ATM puts. Bearish volatility play.',
    outlook: 'Expecting big move, leaning bearish',
    maxProfit: 'Unlimited (larger on downside)', maxLoss: 'Total Premium',
    breakeven: 'Strike ± Premium/qty adjustments',
    idealConditions: 'Pre-event, bearish bias, low IV',
    buildLegs: (p) => [
      leg('CE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
      leg('PE', p.atmStrike, 'BUY', 2, getPremium(p, p.atmStrike, 'PE'), p.expiry),
    ],
  },

  strap: {
    name: 'strap', displayName: 'Strap',
    category: 'BULLISH', riskLevel: 'MODERATE', legCount: 2,
    description: 'Buy 2 ATM calls + 1 ATM put. Bullish volatility play.',
    outlook: 'Expecting big move, leaning bullish',
    maxProfit: 'Unlimited (larger on upside)', maxLoss: 'Total Premium',
    breakeven: 'Strike ± Premium/qty adjustments',
    idealConditions: 'Pre-event, bullish bias, low IV',
    buildLegs: (p) => [
      leg('CE', p.atmStrike, 'BUY', 2, getPremium(p, p.atmStrike, 'CE'), p.expiry),
      leg('PE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
    ],
  },

  ratio_call_spread: {
    name: 'ratio_call_spread', displayName: 'Ratio Call Spread (1:2)',
    category: 'NEUTRAL', riskLevel: 'HIGH', legCount: 2,
    description: 'Buy 1 call, sell 2 higher calls. Can be entered for credit.',
    outlook: 'Neutral to slightly bullish — expects moderate upside',
    maxProfit: '(Higher - Lower Strike) + Net Credit at higher strike',
    maxLoss: 'Unlimited (above upper breakeven)',
    breakeven: 'Higher strike + (Higher - Lower + Net Credit)',
    idealConditions: 'High IV, mild bullish view',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('CE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
        leg('CE', p.atmStrike + offset, 'SELL', 2, getPremium(p, p.atmStrike + offset, 'CE'), p.expiry),
      ];
    },
  },

  ratio_put_spread: {
    name: 'ratio_put_spread', displayName: 'Ratio Put Spread (1:2)',
    category: 'NEUTRAL', riskLevel: 'HIGH', legCount: 2,
    description: 'Buy 1 put, sell 2 lower puts. Can be entered for credit.',
    outlook: 'Neutral to slightly bearish',
    maxProfit: '(Higher - Lower Strike) + Net Credit at lower strike',
    maxLoss: 'Unlimited (below lower breakeven)',
    breakeven: 'Lower strike - (Higher - Lower + Net Credit)',
    idealConditions: 'High IV, mild bearish view',
    buildLegs: (p) => {
      const offset = (p.otmOffset ?? 2) * p.strikeInterval;
      return [
        leg('PE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
        leg('PE', p.atmStrike - offset, 'SELL', 2, getPremium(p, p.atmStrike - offset, 'PE'), p.expiry),
      ];
    },
  },

  calendar_call_spread: {
    name: 'calendar_call_spread', displayName: 'Calendar Call Spread',
    category: 'NEUTRAL', riskLevel: 'LOW', legCount: 2,
    description: 'Sell near-term call, buy far-term call at same strike.',
    outlook: 'Neutral near-term, expecting vol expansion later',
    maxProfit: 'Depends on time value differential', maxLoss: 'Net Debit',
    breakeven: 'Depends on IV at near expiry',
    idealConditions: 'Low near-term IV, higher far-term IV, price near strike',
    buildLegs: (p) => [
      leg('CE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry),
      leg('CE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'CE'), p.expiry), // far month
    ],
  },

  calendar_put_spread: {
    name: 'calendar_put_spread', displayName: 'Calendar Put Spread',
    category: 'NEUTRAL', riskLevel: 'LOW', legCount: 2,
    description: 'Sell near-term put, buy far-term put at same strike.',
    outlook: 'Neutral near-term',
    maxProfit: 'Depends on time value differential', maxLoss: 'Net Debit',
    breakeven: 'Depends on IV at near expiry',
    idealConditions: 'Similar to calendar call spread',
    buildLegs: (p) => [
      leg('PE', p.atmStrike, 'SELL', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
      leg('PE', p.atmStrike, 'BUY', 1, getPremium(p, p.atmStrike, 'PE'), p.expiry),
    ],
  },
};

// ─── PUBLIC API ─────────────────────────────────────────────

/**
 * Build a strategy by name with given parameters.
 */
export function buildStrategy(strategyName: string, params: StrategyParams): StrategyLeg[] {
  const template = STRATEGIES[strategyName];
  if (!template) {
    throw new Error(`Unknown strategy: ${strategyName}. Available: ${Object.keys(STRATEGIES).join(', ')}`);
  }
  return template.buildLegs(params);
}

/**
 * Suggest strategies based on market outlook and risk preference.
 */
export function suggestStrategies(
  outlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILE',
  riskLevel?: 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH'
): StrategyTemplate[] {
  const categoryMap: Record<string, string> = {
    BULLISH: 'BULLISH',
    BEARISH: 'BEARISH',
    NEUTRAL: 'NEUTRAL',
    VOLATILE: 'VOLATILITY',
  };

  const targetCategory = categoryMap[outlook];
  let results = Object.values(STRATEGIES).filter(s => s.category === targetCategory);

  if (riskLevel) {
    const riskOrder = ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH'];
    const maxRiskIdx = riskOrder.indexOf(riskLevel);
    results = results.filter(s => riskOrder.indexOf(s.riskLevel) <= maxRiskIdx);
  }

  return results;
}

/**
 * List all available strategies, optionally filtered by category.
 */
export function listStrategies(category?: string): StrategyTemplate[] {
  if (!category) return Object.values(STRATEGIES);
  return Object.values(STRATEGIES).filter(
    s => s.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get a strategy template by name.
 */
export function getStrategyTemplate(name: string): StrategyTemplate | undefined {
  return STRATEGIES[name];
}
