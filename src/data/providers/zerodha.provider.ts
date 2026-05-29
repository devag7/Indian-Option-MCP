// ────────────────────────────────────────────────────────────────────────────
// Zerodha Kite Connect Data Provider
//
// ■ OPTIONAL — requires API key + access token from config.
// ■ Downloads the instrument-master CSV daily and caches it in memory.
// ■ Builds option chains by filtering instruments then batch-fetching quotes.
// ■ Rate-limited to max 10 requests/second.
// ────────────────────────────────────────────────────────────────────────────

import {
  BaseProvider,
  OptionChainData,
  OptionChainRow,
  OptionData,
  QuoteData,
  MarketStatus,
  CandleData,
  Instrument,
} from './base.provider.js';

// ── Constants ──────────────────────────────────────────────────────────────

const KITE_BASE = 'https://api.kite.trade';

/** Max items per batch quote request. */
const QUOTE_BATCH_SIZE = 500;

/** Minimum gap between requests to respect the 10 req/s limit. */
const MIN_REQUEST_GAP_MS = 110; // ~9 req/s with some headroom

/** Fetch timeout per request (ms). */
const FETCH_TIMEOUT_MS = 30_000;

/** How long to cache the instrument master (ms). */
const INSTRUMENT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000; // 24 hours

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse a CSV row respecting quoted fields.
 */
function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Provider ──────────────────────────────────────────────────────────────

export class ZerodhaProvider extends BaseProvider {
  readonly name = 'zerodha';

  private apiKey: string;
  private apiSecret: string;
  private accessToken: string;

  /** In-memory instrument list (loaded from CSV). */
  private instruments: Instrument[] = [];
  private instrumentsLoadedAt = 0;

  /** Queue for rate-limiting. */
  private requestQueue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(apiKey: string, apiSecret: string, accessToken: string) {
    super();
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accessToken = accessToken;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    console.error('[Zerodha] Initialising provider …');
    if (!this.apiKey || !this.accessToken) {
      throw new Error(
        '[Zerodha] API key and access token are required. ' +
          'Set KITE_API_KEY and KITE_ACCESS_TOKEN in your environment.',
      );
    }
    await this.loadInstruments();
    this._ready = true;
    console.error(
      `[Zerodha] Provider ready — ${this.instruments.length} instruments loaded.`,
    );
  }

  // ── Auth header ────────────────────────────────────────────────────────

  private authHeader(): string {
    return `token ${this.apiKey}:${this.accessToken}`;
  }

  // ── Rate-limited fetch ─────────────────────────────────────────────────

  private async kiteFetch<T>(
    path: string,
    options?: { params?: Record<string, string> },
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.requestQueue = this.requestQueue
        .then(() => this.kiteFetchInner<T>(path, options))
        .then(resolve)
        .catch(reject);
    });
  }

  private async kiteFetchInner<T>(
    path: string,
    options?: { params?: Record<string, string> },
  ): Promise<T> {
    // Enforce minimum gap.
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_REQUEST_GAP_MS) {
      await sleep(MIN_REQUEST_GAP_MS - elapsed);
    }

    let url = `${KITE_BASE}${path}`;
    if (options?.params) {
      const sp = new URLSearchParams(options.params);
      url += `?${sp.toString()}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      this.lastRequestAt = Date.now();

      const res = await fetch(url, {
        headers: {
          Authorization: this.authHeader(),
          'X-Kite-Version': '3',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (res.status === 403 || res.status === 401) {
        throw new Error(
          `[Zerodha] Authentication failed (${res.status}). ` +
            'Access token may have expired — generate a new one.',
        );
      }

      if (res.status === 429) {
        console.error('[Zerodha] 429 rate-limited. Backing off for 1 s …');
        await sleep(1_000);
        throw new Error('[Zerodha] Rate limited — retry later.');
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `[Zerodha] HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`,
        );
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch raw text (used for the instrument CSV download).
   */
  private async kiteFetchText(path: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.requestQueue = this.requestQueue
        .then(() => this.kiteFetchTextInner(path))
        .then(resolve)
        .catch(reject);
    });
  }

  private async kiteFetchTextInner(path: string): Promise<string> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_REQUEST_GAP_MS) {
      await sleep(MIN_REQUEST_GAP_MS - elapsed);
    }

    const url = `${KITE_BASE}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      this.lastRequestAt = Date.now();

      const res = await fetch(url, {
        headers: {
          Authorization: this.authHeader(),
          'X-Kite-Version': '3',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(
          `[Zerodha] HTTP ${res.status} ${res.statusText} on ${path}`,
        );
      }

      return await res.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Instrument master ──────────────────────────────────────────────────

  private async loadInstruments(exchange?: string): Promise<void> {
    const path = exchange ? `/instruments/${exchange}` : '/instruments';
    console.error(`[Zerodha] Downloading instrument master from ${path} …`);

    const csv = await this.kiteFetchText(path);
    const lines = csv.split('\n').filter((l) => l.trim().length > 0);

    if (lines.length < 2) {
      throw new Error('[Zerodha] Instrument CSV is empty or malformed.');
    }

    // Skip header row.
    const instruments: Instrument[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVRow(lines[i]);
      if (cols.length < 12) continue;

      instruments.push({
        instrumentToken: cols[0],
        exchangeToken: cols[1],
        tradingSymbol: cols[2],
        name: cols[3],
        lastPrice: parseFloat(cols[4]) || 0,
        expiry: cols[5] ? this.normaliseKiteDate(cols[5]) : '',
        strike: parseFloat(cols[6]) || 0,
        tickSize: parseFloat(cols[7]) || 0,
        lotSize: parseFloat(cols[8]) || 0,
        instrumentType: cols[9],
        segment: cols[10],
        exchange: cols[11],
      });
    }

    this.instruments = instruments;
    this.instrumentsLoadedAt = Date.now();
    console.error(
      `[Zerodha] Loaded ${instruments.length} instruments.`,
    );
  }

  private isInstrumentCacheStale(): boolean {
    return Date.now() - this.instrumentsLoadedAt > INSTRUMENT_CACHE_TTL_MS;
  }

  private async ensureInstruments(): Promise<void> {
    if (this.instruments.length === 0 || this.isInstrumentCacheStale()) {
      await this.loadInstruments();
    }
  }

  /**
   * Normalise a Kite-format date (yyyy-MM-dd or similar) to ISO yyyy-MM-dd.
   */
  private normaliseKiteDate(raw: string): string {
    // Kite usually provides dates as yyyy-MM-dd already.
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toISOString().split('T')[0];
  }

  // ── Public API ─────────────────────────────────────────────────────────

  async getOptionChain(
    symbol: string,
    expiryDate?: string,
  ): Promise<OptionChainData> {
    await this.ensureInstruments();

    // 1. Determine target expiry.
    const expiries = this.getExpiriesFromInstruments(symbol);
    if (expiries.length === 0) {
      throw new Error(
        `[Zerodha] No F&O instruments found for symbol "${symbol}".`,
      );
    }

    const targetExpiry = expiryDate ?? expiries[0];

    // 2. Filter option instruments for this symbol + expiry.
    const optionInstruments = this.instruments.filter(
      (inst) =>
        inst.name.toUpperCase() === symbol.toUpperCase() &&
        (inst.segment === 'NFO-OPT' || inst.segment === 'BFO-OPT') &&
        inst.expiry === targetExpiry &&
        (inst.instrumentType === 'CE' || inst.instrumentType === 'PE'),
    );

    if (optionInstruments.length === 0) {
      throw new Error(
        `[Zerodha] No option instruments for "${symbol}" expiry ${targetExpiry}.`,
      );
    }

    // 3. Batch-fetch quotes for all option instruments.
    const quoteMap = await this.batchFetchQuotes(optionInstruments);

    // 4. Get spot price.
    const spotPrice = await this.getSpotPrice(symbol);

    // 5. Group by strike and assemble rows.
    const strikeMap = new Map<number, OptionChainRow>();

    for (const inst of optionInstruments) {
      let row = strikeMap.get(inst.strike);
      if (!row) {
        row = { strikePrice: inst.strike, expiryDate: targetExpiry };
        strikeMap.set(inst.strike, row);
      }

      const kiteKey = `${inst.exchange}:${inst.tradingSymbol}`;
      const q = quoteMap.get(kiteKey);

      const leg: OptionData = {
        strikePrice: inst.strike,
        expiryDate: targetExpiry,
        optionType: inst.instrumentType as 'CE' | 'PE',
        lastPrice: q?.last_price ?? 0,
        change: q?.net_change ?? 0,
        pChange: q?.last_price && q?.previousClose
          ? ((q.last_price - q.previousClose) / q.previousClose) * 100
          : 0,
        openInterest: q?.oi ?? 0,
        changeinOpenInterest: q?.oiDayChange ?? 0,
        totalTradedVolume: q?.volume ?? 0,
        impliedVolatility: 0, // Kite doesn't provide IV directly
        bidQty: q?.depth?.buy?.[0]?.quantity ?? 0,
        bidPrice: q?.depth?.buy?.[0]?.price ?? 0,
        askQty: q?.depth?.sell?.[0]?.quantity ?? 0,
        askPrice: q?.depth?.sell?.[0]?.price ?? 0,
        underlyingValue: spotPrice,
      };

      if (inst.instrumentType === 'CE') row.CE = leg;
      else row.PE = leg;
    }

    const rows = Array.from(strikeMap.values()).sort(
      (a, b) => a.strikePrice - b.strikePrice,
    );

    const strikes = rows.map((r) => r.strikePrice);

    let totalCEOI = 0;
    let totalPEOI = 0;
    let totalCEVol = 0;
    let totalPEVol = 0;
    for (const r of rows) {
      totalCEOI += r.CE?.openInterest ?? 0;
      totalPEOI += r.PE?.openInterest ?? 0;
      totalCEVol += r.CE?.totalTradedVolume ?? 0;
      totalPEVol += r.PE?.totalTradedVolume ?? 0;
    }

    return {
      symbol,
      underlyingValue: spotPrice,
      expiryDate: targetExpiry,
      expiryDates: expiries,
      strikePrices: strikes,
      rows,
      timestamp: new Date().toISOString(),
      totalCEOpenInterest: totalCEOI,
      totalPEOpenInterest: totalPEOI,
      totalCEVolume: totalCEVol,
      totalPEVolume: totalPEVol,
    };
  }

  async getQuote(symbol: string): Promise<QuoteData> {
    // Determine the right instrument identifier.
    const key = this.resolveQuoteKey(symbol);

    const raw = await this.kiteFetch<KiteQuoteResponse>('/quote', {
      params: { i: key },
    });

    const q = raw.data?.[key];
    if (!q) {
      throw new Error(`[Zerodha] No quote data returned for "${key}".`);
    }

    return {
      symbol,
      lastPrice: q.last_price ?? 0,
      change: q.net_change ?? 0,
      pChange:
        q.last_price && q.ohlc?.close
          ? ((q.last_price - q.ohlc.close) / q.ohlc.close) * 100
          : 0,
      open: q.ohlc?.open ?? 0,
      high: q.ohlc?.high ?? 0,
      low: q.ohlc?.low ?? 0,
      close: q.ohlc?.close ?? 0,
      volume: q.volume ?? 0,
      timestamp: q.timestamp ?? new Date().toISOString(),
    };
  }

  async getQuotes(symbols: string[]): Promise<Map<string, QuoteData>> {
    const map = new Map<string, QuoteData>();
    // Fetch one by one via queue (each call is rate-limited).
    for (const sym of symbols) {
      try {
        map.set(sym, await this.getQuote(sym));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Zerodha] Failed to get quote for ${sym}: ${msg}`);
      }
    }
    return map;
  }

  async getExpiryDates(symbol: string): Promise<string[]> {
    await this.ensureInstruments();
    return this.getExpiriesFromInstruments(symbol);
  }

  async getSpotPrice(symbol: string): Promise<number> {
    // Try NSE index key first, then equity.
    const keys = [`NSE:${symbol}`, `NSE:${symbol}-EQ`];
    for (const key of keys) {
      try {
        const raw = await this.kiteFetch<KiteLTPResponse>('/quote/ltp', {
          params: { i: key },
        });
        const ltp = raw.data?.[key]?.last_price;
        if (typeof ltp === 'number' && ltp > 0) return ltp;
      } catch {
        // try next key
      }
    }
    // Fallback: look for an EQ instrument.
    const q = await this.getQuote(symbol);
    return q.lastPrice;
  }

  async getHistoricalData(
    symbol: string,
    from: Date,
    to: Date,
    interval = 'day',
  ): Promise<CandleData[]> {
    await this.ensureInstruments();

    // Find instrument token.
    const inst = this.instruments.find(
      (i) =>
        (i.tradingSymbol.toUpperCase() === symbol.toUpperCase() ||
          i.name.toUpperCase() === symbol.toUpperCase()) &&
        (i.exchange === 'NSE' || i.exchange === 'NFO'),
    );

    if (!inst) {
      console.error(
        `[Zerodha] No instrument found for historical data: "${symbol}".`,
      );
      return [];
    }

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const raw = await this.kiteFetch<KiteHistoricalResponse>(
      `/instruments/historical/${inst.instrumentToken}/${interval}`,
      { params: { from: fromStr, to: toStr } },
    );

    const candles = raw.data?.candles ?? [];

    return candles.map((c: (string | number)[]) => ({
      timestamp: String(c[0]),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
      oi: c.length > 6 ? Number(c[6]) : undefined,
    }));
  }

  async getInstruments(exchange?: string): Promise<Instrument[]> {
    if (this.instruments.length === 0 || this.isInstrumentCacheStale()) {
      await this.loadInstruments(exchange);
    }

    if (exchange) {
      return this.instruments.filter(
        (i) => i.exchange.toUpperCase() === exchange.toUpperCase(),
      );
    }

    return this.instruments;
  }

  async getMarketStatus(): Promise<MarketStatus> {
    // Kite doesn't have a dedicated market-status endpoint.
    // We infer from the current time relative to IST trading hours.
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1_000;
    const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60_000);
    const hours = ist.getHours();
    const minutes = ist.getMinutes();
    const day = ist.getDay(); // 0=Sun, 6=Sat

    let status: MarketStatus['status'] = 'Closed';
    if (day >= 1 && day <= 5) {
      const timeMinutes = hours * 60 + minutes;
      if (timeMinutes >= 555 && timeMinutes < 930) {
        // 9:15 AM to 3:30 PM IST
        status = 'Open';
      } else if (timeMinutes >= 900 && timeMinutes < 555) {
        status = 'Pre-open';
      } else if (timeMinutes >= 930 && timeMinutes < 960) {
        status = 'Post-close';
      }
    }

    return {
      market: 'Capital Market',
      status,
      timestamp: now.toISOString(),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private getExpiriesFromInstruments(symbol: string): string[] {
    const expirySet = new Set<string>();
    for (const inst of this.instruments) {
      if (
        inst.name.toUpperCase() === symbol.toUpperCase() &&
        (inst.segment === 'NFO-OPT' || inst.segment === 'BFO-OPT') &&
        inst.expiry
      ) {
        expirySet.add(inst.expiry);
      }
    }
    return Array.from(expirySet).sort();
  }

  private resolveQuoteKey(symbol: string): string {
    // Check instruments for exact match.
    const inst = this.instruments.find(
      (i) => i.tradingSymbol.toUpperCase() === symbol.toUpperCase(),
    );
    if (inst) return `${inst.exchange}:${inst.tradingSymbol}`;

    // Check for index.
    const indexInst = this.instruments.find(
      (i) =>
        i.name.toUpperCase() === symbol.toUpperCase() &&
        i.instrumentType === 'IDX',
    );
    if (indexInst) return `${indexInst.exchange}:${indexInst.tradingSymbol}`;

    // Fallback: assume NSE equity.
    return `NSE:${symbol}`;
  }

  /**
   * Batch-fetch full quotes for a list of instruments (max 500 per batch).
   */
  private async batchFetchQuotes(
    instruments: Instrument[],
  ): Promise<Map<string, KiteQuoteData>> {
    const allQuotes = new Map<string, KiteQuoteData>();

    // Split into chunks.
    for (let i = 0; i < instruments.length; i += QUOTE_BATCH_SIZE) {
      const batch = instruments.slice(i, i + QUOTE_BATCH_SIZE);
      const keys = batch.map(
        (inst) => `${inst.exchange}:${inst.tradingSymbol}`,
      );

      try {
        // The Kite quote endpoint accepts multiple `i` params.
        // Build the URL manually since URLSearchParams doesn't handle repeated keys well.
        const queryStr = keys.map((k) => `i=${encodeURIComponent(k)}`).join('&');
        const url = `/quote?${queryStr}`;

        // Use direct fetch since we built the URL ourselves.
        const raw = await this.kiteFetchDirect<KiteQuoteResponse>(url);

        if (raw.data) {
          for (const [key, val] of Object.entries(raw.data)) {
            allQuotes.set(key, val);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[Zerodha] Failed to batch-fetch quotes (batch ${Math.floor(i / QUOTE_BATCH_SIZE) + 1}): ${msg}`,
        );
      }
    }

    return allQuotes;
  }

  /**
   * Direct fetch with the full path (including query string).
   */
  private async kiteFetchDirect<T>(fullPath: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.requestQueue = this.requestQueue
        .then(() => this.kiteFetchDirectInner<T>(fullPath))
        .then(resolve)
        .catch(reject);
    });
  }

  private async kiteFetchDirectInner<T>(fullPath: string): Promise<T> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < MIN_REQUEST_GAP_MS) {
      await sleep(MIN_REQUEST_GAP_MS - elapsed);
    }

    const url = `${KITE_BASE}${fullPath}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      this.lastRequestAt = Date.now();

      const res = await fetch(url, {
        headers: {
          Authorization: this.authHeader(),
          'X-Kite-Version': '3',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `[Zerodha] HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`,
        );
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// ── Kite Connect raw response shapes (internal) ─────────────────────────

interface KiteQuoteData {
  last_price?: number;
  net_change?: number;
  volume?: number;
  oi?: number;
  oiDayChange?: number;
  previousClose?: number;
  ohlc?: { open?: number; high?: number; low?: number; close?: number };
  depth?: {
    buy?: Array<{ price?: number; quantity?: number }>;
    sell?: Array<{ price?: number; quantity?: number }>;
  };
  timestamp?: string;
}

interface KiteQuoteResponse {
  status?: string;
  data?: Record<string, KiteQuoteData>;
}

interface KiteLTPResponse {
  status?: string;
  data?: Record<string, { last_price?: number; instrument_token?: number }>;
}

interface KiteHistoricalResponse {
  status?: string;
  data?: {
    candles?: (string | number)[][];
  };
}
