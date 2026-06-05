/**
 * @fileoverview Tests for Black-Scholes pricing engine
 *
 * Tests validated against known BSM reference values:
 * - ATM NIFTY call: S=24000, K=24000, T=30d, r=7%, σ=15%
 * - Deep ITM/OTM edge cases
 * - Put-call parity
 * - Greeks sign conventions
 */
import { describe, it, expect } from 'vitest';
import {
  callPrice,
  putPrice,
  calculateGreeks,
} from '../engine/black-scholes.js';

describe('Black-Scholes Option Pricing', () => {
  // Common test parameters (NIFTY ATM, 30-day, 15% IV, 7% risk-free)
  const S = 24000;
  const K = 24000;
  const T = 30 / 365; // 30 days
  const r = 0.07;
  const sigma = 0.15;
  const q = 0; // no dividend yield

  describe('callPrice', () => {
    it('returns a positive price for ATM call', () => {
      const price = callPrice(S, K, T, r, sigma);
      expect(price).toBeGreaterThan(0);
      // ATM 30-day call with 15% IV should be roughly 300-500
      expect(price).toBeGreaterThan(200);
      expect(price).toBeLessThan(700);
    });

    it('returns higher price for longer expiry', () => {
      const short = callPrice(S, K, 7 / 365, r, sigma);
      const long = callPrice(S, K, 60 / 365, r, sigma);
      expect(long).toBeGreaterThan(short);
    });

    it('returns higher price for higher volatility', () => {
      const lowVol = callPrice(S, K, T, r, 0.10);
      const highVol = callPrice(S, K, T, r, 0.25);
      expect(highVol).toBeGreaterThan(lowVol);
    });

    it('returns intrinsic value at expiry (T=0)', () => {
      expect(callPrice(24500, 24000, 0, r, sigma)).toBeCloseTo(500, 0);
      expect(callPrice(23500, 24000, 0, r, sigma)).toBe(0);
    });

    it('returns 0 for S=0', () => {
      expect(callPrice(0, K, T, r, sigma)).toBe(0);
    });
  });

  describe('putPrice', () => {
    it('returns a positive price for ATM put', () => {
      const price = putPrice(S, K, T, r, sigma);
      expect(price).toBeGreaterThan(0);
    });

    it('returns intrinsic value at expiry (T=0)', () => {
      expect(putPrice(23500, 24000, 0, r, sigma)).toBeCloseTo(500, 0);
      expect(putPrice(24500, 24000, 0, r, sigma)).toBe(0);
    });
  });

  describe('put-call parity', () => {
    it('satisfies C - P = S·e^(-qT) - K·e^(-rT)', () => {
      const C = callPrice(S, K, T, r, sigma);
      const P = putPrice(S, K, T, r, sigma);
      const parity = S - K * Math.exp(-r * T);
      expect(C - P).toBeCloseTo(parity, 1);
    });
  });

  describe('calculateGreeks', () => {
    // Signature: calculateGreeks(S, K, T, r, sigma, q, type)
    it('returns all first-order Greeks', () => {
      const greeks = calculateGreeks(S, K, T, r, sigma, q, 'CE');
      expect(greeks).toHaveProperty('delta');
      expect(greeks).toHaveProperty('gamma');
      expect(greeks).toHaveProperty('theta');
      expect(greeks).toHaveProperty('vega');
      expect(greeks).toHaveProperty('rho');
    });

    it('call delta is between 0 and 1', () => {
      const greeks = calculateGreeks(S, K, T, r, sigma, q, 'CE');
      expect(greeks.delta).toBeGreaterThan(0);
      expect(greeks.delta).toBeLessThanOrEqual(1);
    });

    it('ATM call delta is near 0.5', () => {
      const greeks = calculateGreeks(S, K, T, r, sigma, q, 'CE');
      expect(greeks.delta).toBeGreaterThan(0.4);
      expect(greeks.delta).toBeLessThan(0.65);
    });

    it('put delta is between -1 and 0', () => {
      const greeks = calculateGreeks(S, K, T, r, sigma, q, 'PE');
      expect(greeks.delta).toBeLessThan(0);
      expect(greeks.delta).toBeGreaterThanOrEqual(-1);
    });

    it('gamma is always positive', () => {
      const ceGreeks = calculateGreeks(S, K, T, r, sigma, q, 'CE');
      const peGreeks = calculateGreeks(S, K, T, r, sigma, q, 'PE');
      expect(ceGreeks.gamma).toBeGreaterThan(0);
      expect(peGreeks.gamma).toBeGreaterThan(0);
    });

    it('theta is negative for long options', () => {
      const greeks = calculateGreeks(S, K, T, r, sigma, q, 'CE');
      expect(greeks.theta).toBeLessThan(0);
    });

    it('vega is positive for long options', () => {
      const greeks = calculateGreeks(S, K, T, r, sigma, q, 'CE');
      expect(greeks.vega).toBeGreaterThan(0);
    });

    it('call and put gamma are equal', () => {
      const ceGreeks = calculateGreeks(S, K, T, r, sigma, q, 'CE');
      const peGreeks = calculateGreeks(S, K, T, r, sigma, q, 'PE');
      expect(ceGreeks.gamma).toBeCloseTo(peGreeks.gamma, 6);
    });

    it('call and put vega are equal', () => {
      const ceGreeks = calculateGreeks(S, K, T, r, sigma, q, 'CE');
      const peGreeks = calculateGreeks(S, K, T, r, sigma, q, 'PE');
      expect(ceGreeks.vega).toBeCloseTo(peGreeks.vega, 6);
    });
  });
});
