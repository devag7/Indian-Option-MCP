// ────────────────────────────────────────────────────────────────────────────
// Instrument Cache
//
// Wraps a DataProvider's instrument list and provides fast lookups for:
//   • Option instruments by symbol + expiry
//   • Available strikes and expiry dates
//   • ATM strike and nearby-strike discovery
//
// The cache auto-refreshes when stale (configurable TTL, default 12 h).
// ────────────────────────────────────────────────────────────────────────────

import type { DataProvider, Instrument } from '../providers/base.provider.js';

export class InstrumentCache {
  private provider: DataProvider;
  private ttlMs: number;

  /** Raw instrument list from the provider. */
  private instruments: Instrument[] = [];

  /** Last refresh epoch (ms). */
  private refreshedAt = 0;

  /** Pre-built indexes for fast lookups. */
  private bySymbol = new Map<string, Instrument[]>();
  private expiryIndex = new Map<string, Set<string>>(); // symbol → Set<expiry>
  private strikeIndex = new Map<string, Set<number>>();  // "symbol|expiry" → Set<strike>

  /** Guard to prevent concurrent refreshes. */
  private refreshPromise: Promise<void> | null = null;

  constructor(provider: DataProvider, ttlHours = 12) {
    this.provider = provider;
    this.ttlMs = ttlHours * 60 * 60 * 1_000;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async refresh(): Promise<void> {
    // Coalesce concurrent refresh calls.
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    console.error('[InstrumentCache] Refreshing instrument data …');

    try {
      this.instruments = await this.provider.getInstruments();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[InstrumentCache] Failed to load instruments: ${msg}`);
      // If we already have data, keep using it.
      if (this.instruments.length > 0) {
        console.error('[InstrumentCache] Keeping stale data.');
        return;
      }
      throw new Error(`Instrument refresh failed: ${msg}`);
    }

    this.buildIndexes();
    this.refreshedAt = Date.now();
    console.error(
      `[InstrumentCache] Loaded ${this.instruments.length} instruments, ` +
        `${this.bySymbol.size} unique symbols.`,
    );
  }

  private buildIndexes(): void {
    this.bySymbol.clear();
    this.expiryIndex.clear();
    this.strikeIndex.clear();

    for (const inst of this.instruments) {
      const sym = inst.name.toUpperCase();

      // by symbol
      let list = this.bySymbol.get(sym);
      if (!list) {
        list = [];
        this.bySymbol.set(sym, list);
      }
      list.push(inst);

      // Only index option instruments.
      if (inst.instrumentType !== 'CE' && inst.instrumentType !== 'PE') continue;
      if (!inst.expiry) continue;

      // expiry index
      let expirySet = this.expiryIndex.get(sym);
      if (!expirySet) {
        expirySet = new Set();
        this.expiryIndex.set(sym, expirySet);
      }
      expirySet.add(inst.expiry);

      // strike index
      const strikeKey = `${sym}|${inst.expiry}`;
      let strikes = this.strikeIndex.get(strikeKey);
      if (!strikes) {
        strikes = new Set();
        this.strikeIndex.set(strikeKey, strikes);
      }
      strikes.add(inst.strike);
    }
  }

  // ── Staleness check ────────────────────────────────────────────────────

  isStale(): boolean {
    if (this.instruments.length === 0) return true;
    return Date.now() - this.refreshedAt > this.ttlMs;
  }

  private async ensureFresh(): Promise<void> {
    if (this.isStale()) {
      await this.refresh();
    }
  }

  // ── Queries ────────────────────────────────────────────────────────────

  /**
   * Get all option instruments (CE + PE) for a symbol, optionally filtered
   * by expiry date.
   */
  getOptionInstruments(symbol: string, expiry?: string): Instrument[] {
    const sym = symbol.toUpperCase();
    const all = this.bySymbol.get(sym) ?? [];
    return all.filter((inst) => {
      if (inst.instrumentType !== 'CE' && inst.instrumentType !== 'PE') {
        return false;
      }
      if (expiry && inst.expiry !== expiry) return false;
      return true;
    });
  }

  /**
   * Get all available strikes for a symbol + expiry, sorted ascending.
   */
  getStrikes(symbol: string, expiry: string): number[] {
    const key = `${symbol.toUpperCase()}|${expiry}`;
    const set = this.strikeIndex.get(key);
    if (!set) return [];
    return Array.from(set).sort((a, b) => a - b);
  }

  /**
   * Get all available expiry dates for a symbol, sorted ascending.
   */
  getExpiries(symbol: string): string[] {
    const set = this.expiryIndex.get(symbol.toUpperCase());
    if (!set) return [];
    return Array.from(set).sort();
  }

  /**
   * Find the ATM (at-the-money) strike closest to `spotPrice`.
   */
  findATMStrike(
    symbol: string,
    spotPrice: number,
    expiry: string,
  ): number {
    const strikes = this.getStrikes(symbol, expiry);
    if (strikes.length === 0) {
      throw new Error(
        `[InstrumentCache] No strikes found for ${symbol} expiry ${expiry}.`,
      );
    }

    let best = strikes[0];
    let bestDiff = Math.abs(spotPrice - best);

    for (const s of strikes) {
      const diff = Math.abs(spotPrice - s);
      if (diff < bestDiff) {
        best = s;
        bestDiff = diff;
      }
    }

    return best;
  }

  /**
   * Get `range` strikes on either side of ATM, producing a window of
   * (2 × range + 1) strikes centred on ATM.
   *
   * @param range  Number of strikes on each side (default 10).
   */
  getNearbyStrikes(
    symbol: string,
    spotPrice: number,
    expiry: string,
    range = 10,
  ): number[] {
    const strikes = this.getStrikes(symbol, expiry);
    if (strikes.length === 0) return [];

    const atm = this.findATMStrike(symbol, spotPrice, expiry);
    const atmIdx = strikes.indexOf(atm);
    if (atmIdx === -1) return strikes.slice(0, range * 2 + 1);

    const lo = Math.max(0, atmIdx - range);
    const hi = Math.min(strikes.length, atmIdx + range + 1);
    return strikes.slice(lo, hi);
  }
}
