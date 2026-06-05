// ────────────────────────────────────────────────────────────────────────────
// NSE India Data Provider
//
// ■ FREE — no API key required.
// ■ Session cookies are scraped from the home page and refreshed every 5 min.
// ■ User-Agent strings are rotated on every request.
// ■ A minimum 3-second gap is enforced between consecutive requests.
// ■ Retries use exponential back-off (up to 3 attempts).
// ■ HTML responses (= IP blocked) are caught and reported gracefully.
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

const NSE_BASE = 'https://www.nseindia.com';

/** Known index symbols that need the *indices* option-chain endpoint. */
const INDEX_SYMBOLS = new Set([
  'NIFTY',
  'BANKNIFTY',
  'NIFTY BANK',
  'FINNIFTY',
  'MIDCPNIFTY',
  'NIFTY NEXT 50',
  'NIFTY IT',
  'NIFTY 50',
]);

/** Minimum gap between two consecutive HTTP calls (ms). */
const MIN_REQUEST_GAP_MS = 3_000;

/** How often to refresh session cookies (ms). */
const SESSION_REFRESH_MS = 5 * 60 * 1_000; // 5 minutes

/** Maximum retry attempts per request. */
const MAX_RETRIES = 3;

/** Base delay for exponential back-off (ms). */
const BASE_BACKOFF_MS = 2_000;

/** Fetch timeout per request (ms). */
const FETCH_TIMEOUT_MS = 15_000;

// ── User-Agent pool (12 realistic strings) ────────────────────────────────

const USER_AGENTS: string[] = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 OPR/109.0.0.0',
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Vivaldi/6.7',
];

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse an NSE-style date string like "29-May-2026" into ISO "2026-05-29".
 * Returns the original string untouched if parsing fails.
 */
function parseNSEDate(raw: string): string {
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04',
    May: '05', Jun: '06', Jul: '07', Aug: '08',
    Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return raw;
  const day = m[1].padStart(2, '0');
  const mon = months[m[2]];
  if (!mon) return raw;
  return `${m[3]}-${mon}-${day}`;
}

/** Sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pick a random element from an array. */
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Session manager ───────────────────────────────────────────────────────

interface NseSession {
  cookies: string;
  refreshedAt: number;   // epoch ms
}

// ── Provider ──────────────────────────────────────────────────────────────

export class NSEProvider extends BaseProvider {
  readonly name = 'nse';

  private session: NseSession | null = null;
  private lastRequestAt = 0;

  /** Queue that serialises requests so the rate-limit is enforced. */
  private requestQueue: Promise<unknown> = Promise.resolve();

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    console.error('[NSE] Initialising provider …');
    await this.refreshSession();
    this._ready = true;
    console.error('[NSE] Provider ready.');
  }

  // ── Session management ─────────────────────────────────────────────────

  private async refreshSession(): Promise<void> {
    console.error('[NSE] Refreshing session cookies …');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(NSE_BASE, {
        headers: {
          'User-Agent': randomItem(USER_AGENTS),
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
      // Fallback: some Node versions expose raw header
      const cookieList: string[] = setCookieHeaders.length
        ? setCookieHeaders
        : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/);

      const cookies = cookieList
        .map((c) => c.split(';')[0].trim())
        .filter(Boolean)
        .join('; ');

      if (!cookies) {
        console.error('[NSE] WARNING — no cookies received from homepage.');
      }

      this.session = { cookies, refreshedAt: Date.now() };
      console.error(`[NSE] Session cookies obtained (length=${cookies.length}).`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[NSE] Failed to refresh session: ${msg}`);
      throw new Error(`NSE session refresh failed: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isSessionStale(): boolean {
    if (!this.session) return true;
    return Date.now() - this.session.refreshedAt > SESSION_REFRESH_MS;
  }

  private async ensureSession(): Promise<void> {
    if (this.isSessionStale()) {
      await this.refreshSession();
    }
  }

  // ── Rate-limited fetch ─────────────────────────────────────────────────

  /**
   * All HTTP calls to NSE are funnelled through this method.  It:
   * 1. Serialises via a promise queue (rate limiting)
   * 2. Waits for the minimum gap between requests
   * 3. Retries with exponential back-off on transient failures
   * 4. Detects HTML-instead-of-JSON responses (IP blocked)
   */
  private async nseFetch<T>(path: string): Promise<T> {
    // Wrap in queue so concurrent callers are serialised.
    return new Promise<T>((resolve, reject) => {
      this.requestQueue = this.requestQueue
        .then(() => this.nseFetchInner<T>(path))
        .then(resolve)
        .catch(reject);
    });
  }

  private async nseFetchInner<T>(path: string): Promise<T> {
    await this.ensureSession();

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Enforce minimum gap.
      const elapsed = Date.now() - this.lastRequestAt;
      if (elapsed < MIN_REQUEST_GAP_MS) {
        await sleep(MIN_REQUEST_GAP_MS - elapsed);
      }

      const url = `${NSE_BASE}${path}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        this.lastRequestAt = Date.now();

        const res = await fetch(url, {
          headers: {
            'User-Agent': randomItem(USER_AGENTS),
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            Referer: `${NSE_BASE}/`,
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: this.session?.cookies ?? '',
          },
          redirect: 'follow',
          signal: controller.signal,
        });

        // 401/403 ⇒ session expired — refresh and retry.
        if (res.status === 401 || res.status === 403) {
          console.error(
            `[NSE] ${res.status} on ${path} – refreshing session (attempt ${attempt}/${MAX_RETRIES}).`,
          );
          await this.refreshSession();
          lastError = new Error(`HTTP ${res.status}`);
          await sleep(BASE_BACKOFF_MS * attempt);
          continue;
        }

        // 429 rate-limited.
        if (res.status === 429) {
          console.error(
            `[NSE] 429 rate-limited on ${path} (attempt ${attempt}/${MAX_RETRIES}).`,
          );
          lastError = new Error('HTTP 429 – rate limited');
          await sleep(BASE_BACKOFF_MS * attempt * 2);
          continue;
        }

        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
          console.error(
            `[NSE] ${lastError.message} on ${path} (attempt ${attempt}/${MAX_RETRIES}).`,
          );
          await sleep(BASE_BACKOFF_MS * attempt);
          continue;
        }

        const text = await res.text();

        // Detect HTML response (NSE returns the home page when it blocks).
        if (
          text.trimStart().startsWith('<!') ||
          text.trimStart().startsWith('<html')
        ) {
          console.error(
            `[NSE] Got HTML instead of JSON on ${path} — likely blocked. Refreshing session (attempt ${attempt}/${MAX_RETRIES}).`,
          );
          await this.refreshSession();
          lastError = new Error('NSE returned HTML instead of JSON (blocked)');
          await sleep(BASE_BACKOFF_MS * attempt);
          continue;
        }

        try {
          return JSON.parse(text) as T;
        } catch {
          lastError = new Error('Invalid JSON from NSE');
          console.error(
            `[NSE] JSON parse error on ${path} (attempt ${attempt}/${MAX_RETRIES}).`,
          );
          await sleep(BASE_BACKOFF_MS * attempt);
          continue;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = new Error(msg);
        console.error(
          `[NSE] Fetch error on ${path}: ${msg} (attempt ${attempt}/${MAX_RETRIES}).`,
        );
        if (msg.includes('abort')) {
          console.error('[NSE] Request timed out.');
        }
        await sleep(BASE_BACKOFF_MS * attempt);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError ?? new Error(`NSE request failed after ${MAX_RETRIES} retries`);
  }

  // ── Utility: is this an index? ─────────────────────────────────────────

  private isIndex(symbol: string): boolean {
    return INDEX_SYMBOLS.has(symbol.toUpperCase());
  }

  // ── Public API ─────────────────────────────────────────────────────────

  async getOptionChain(
    symbol: string,
    expiryDate?: string,
  ): Promise<OptionChainData> {
    const upperSymbol = symbol.toUpperCase();

    // ── Primary endpoint (available during & shortly after market hours) ──
    try {
      const endpoint = this.isIndex(upperSymbol)
        ? `/api/option-chain-indices?symbol=${encodeURIComponent(upperSymbol)}`
        : `/api/option-chain-equities?symbol=${encodeURIComponent(upperSymbol)}`;

      const raw = await this.nseFetch<NseOptionChainResponse>(endpoint);
      // Validate we got actual data (NSE sometimes returns empty JSON)
      if (raw?.records?.data?.length) {
        return this.mapOptionChain(upperSymbol, raw, expiryDate);
      }
      console.error('[NSE] Primary option chain returned empty data — trying fallback.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[NSE] Primary option chain failed: ${msg} — trying fallback endpoint.`);
    }

    // ── Fallback: /api/liveEquity-derivatives (available even after hours) ──
    try {
      return await this.getOptionChainFromDerivatives(upperSymbol, expiryDate);
    } catch (fallbackErr: unknown) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.error(`[NSE] Fallback endpoint also failed: ${msg}`);
      throw new Error(
        `NSE option chain unavailable for ${upperSymbol}. ` +
        `Both primary and fallback APIs returned errors. ` +
        `NSE may be undergoing maintenance. Try again in a few minutes.`,
      );
    }
  }

  // ── Fallback option chain from live derivatives endpoint ─────────────

  /** Map symbol to the NSE derivatives index filter value */
  private getDerivativesIndex(symbol: string): string {
    const map: Record<string, string> = {
      NIFTY: 'nse50_opt',
      'NIFTY 50': 'nse50_opt',
      BANKNIFTY: 'nsebank_opt',
      'NIFTY BANK': 'nsebank_opt',
      FINNIFTY: 'nse_fo',
      MIDCPNIFTY: 'nse_fo',
    };
    return map[symbol] ?? 'nse_fo';
  }

  private async getOptionChainFromDerivatives(
    symbol: string,
    filterExpiry?: string,
  ): Promise<OptionChainData> {
    const indexParam = this.getDerivativesIndex(symbol);
    const raw = await this.nseFetch<NseLiveDerivativesResponse>(
      `/api/liveEquity-derivatives?index=${indexParam}`,
    );

    if (!raw?.data?.length) {
      throw new Error('No derivatives data returned from NSE');
    }

    // Filter rows for this symbol
    const symbolRows = raw.data.filter(
      (r) => r.underlying?.toUpperCase() === symbol &&
             (r.instrumentType === 'OPTIDX' || r.instrumentType === 'OPTSTK'),
    );

    if (!symbolRows.length) {
      throw new Error(`No option data found for ${symbol} in derivatives feed`);
    }

    // Collect unique expiry dates and strike prices
    const expirySet = new Set<string>();
    const strikeSet = new Set<number>();
    let underlyingValue = 0;

    for (const row of symbolRows) {
      expirySet.add(parseNSEDate(row.expiryDate ?? ''));
      strikeSet.add(row.strikePrice ?? 0);
      if (row.underlyingValue && row.underlyingValue > 0) {
        underlyingValue = row.underlyingValue;
      }
    }

    const allExpiryDates = Array.from(expirySet).sort();
    const allStrikePrices = Array.from(strikeSet).sort((a, b) => a - b);

    // Determine target expiry
    let targetExpiry: string | undefined;
    if (filterExpiry) {
      targetExpiry = filterExpiry.includes('-') && filterExpiry.length === 10
        ? filterExpiry
        : parseNSEDate(filterExpiry);
    } else {
      // Use nearest expiry
      targetExpiry = allExpiryDates[0];
    }

    // Build option chain rows
    const rowMap = new Map<string, OptionChainRow>();

    for (const entry of symbolRows) {
      const iso = parseNSEDate(entry.expiryDate ?? '');
      if (targetExpiry && iso !== targetExpiry) continue;

      const strike = entry.strikePrice ?? 0;
      const key = `${iso}|${strike}`;
      let row = rowMap.get(key);
      if (!row) {
        row = { strikePrice: strike, expiryDate: iso };
        rowMap.set(key, row);
      }

      const optType = entry.optionType?.toUpperCase().startsWith('C') ? 'CE' : 'PE';
      const leg: OptionData = {
        strikePrice: strike,
        expiryDate: iso,
        optionType: optType,
        lastPrice: entry.lastPrice ?? 0,
        change: entry.change ?? 0,
        pChange: entry.pChange ?? 0,
        openInterest: entry.openInterest ?? 0,
        changeinOpenInterest: 0, // not available in this endpoint
        totalTradedVolume: entry.volume ?? 0,
        impliedVolatility: 0, // not available in this endpoint
        bidQty: 0,
        bidPrice: 0,
        askQty: 0,
        askPrice: 0,
        underlyingValue: entry.underlyingValue ?? underlyingValue,
      };

      if (optType === 'CE') row.CE = leg;
      else row.PE = leg;
    }

    const rows = Array.from(rowMap.values()).sort(
      (a, b) => a.strikePrice - b.strikePrice,
    );

    // Compute totals
    let totalCEOI = 0, totalPEOI = 0, totalCEVol = 0, totalPEVol = 0;
    for (const r of rows) {
      totalCEOI += r.CE?.openInterest ?? 0;
      totalPEOI += r.PE?.openInterest ?? 0;
      totalCEVol += r.CE?.totalTradedVolume ?? 0;
      totalPEVol += r.PE?.totalTradedVolume ?? 0;
    }

    console.error(
      `[NSE] Fallback chain: ${rows.length} strikes, expiry=${targetExpiry}, ` +
      `underlying=${underlyingValue} (IV not available in this endpoint)`,
    );

    return {
      symbol,
      underlyingValue,
      expiryDate: targetExpiry ?? allExpiryDates[0] ?? '',
      expiryDates: allExpiryDates,
      strikePrices: allStrikePrices,
      rows,
      timestamp: raw.timestamp ?? new Date().toISOString(),
      totalCEOpenInterest: totalCEOI,
      totalPEOpenInterest: totalPEOI,
      totalCEVolume: totalCEVol,
      totalPEVolume: totalPEVol,
    };
  }

  async getQuote(symbol: string): Promise<QuoteData> {
    if (this.isIndex(symbol)) {
      return this.getIndexQuote(symbol);
    }
    const raw = await this.nseFetch<NseEquityQuoteResponse>(
      `/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
    );
    const p = raw.priceInfo ?? {};
    return {
      symbol,
      lastPrice: p.lastPrice ?? 0,
      change: p.change ?? 0,
      pChange: p.pChange ?? 0,
      open: p.open ?? 0,
      high: p.intraDayHighLow?.max ?? p.weekHighLow?.max ?? 0,
      low: p.intraDayHighLow?.min ?? p.weekHighLow?.min ?? 0,
      close: p.previousClose ?? p.close ?? 0,
      volume: raw.securityWiseDP?.quantityTraded ?? 0,
      timestamp: raw.metadata?.lastUpdateTime ?? new Date().toISOString(),
    };
  }

  async getQuotes(symbols: string[]): Promise<Map<string, QuoteData>> {
    const map = new Map<string, QuoteData>();
    // NSE has no batch quote endpoint – fetch sequentially to honour rate limit.
    for (const sym of symbols) {
      try {
        const q = await this.getQuote(sym);
        map.set(sym, q);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[NSE] Failed to fetch quote for ${sym}: ${msg}`);
      }
    }
    return map;
  }

  async getExpiryDates(symbol: string): Promise<string[]> {
    // Reuse getOptionChain which handles fallback to liveEquity-derivatives
    const chain = await this.getOptionChain(symbol);
    return chain.expiryDates;
  }

  async getSpotPrice(symbol: string): Promise<number> {
    if (this.isIndex(symbol)) {
      const q = await this.getIndexQuote(symbol);
      return q.lastPrice;
    }
    // Use option chain's underlyingValue for F&O underlyings, fallback to equity quote.
    try {
      const endpoint = `/api/option-chain-equities?symbol=${encodeURIComponent(symbol)}`;
      const raw = await this.nseFetch<NseOptionChainResponse>(endpoint);
      const uv = raw?.records?.underlyingValue;
      if (typeof uv === 'number' && uv > 0) return uv;
    } catch {
      // fallback below
    }
    const q = await this.getQuote(symbol);
    return q.lastPrice;
  }

  async getHistoricalData(
    _symbol: string,
    _from: Date,
    _to: Date,
    _interval?: string,
  ): Promise<CandleData[]> {
    console.error(
      '[NSE] getHistoricalData is not supported by the NSE provider — ' +
        'NSE does not expose a public historical OHLCV API. Returning empty array.',
    );
    return [];
  }

  async getInstruments(_exchange?: string): Promise<Instrument[]> {
    console.error(
      '[NSE] getInstruments is not natively supported. ' +
        'Use the Zerodha provider for full instrument master data.',
    );
    return [];
  }

  async getMarketStatus(): Promise<MarketStatus> {
    const raw = await this.nseFetch<NseMarketStatusResponse>(
      '/api/marketStatus',
    );

    // The response contains an array of market segments.
    // We look for "Capital Market" or the first entry.
    const segment =
      raw.marketState?.find(
        (s) =>
          s.market?.toLowerCase().includes('capital') ||
          s.market?.toLowerCase().includes('equity'),
      ) ?? raw.marketState?.[0];

    const statusRaw = (segment?.marketStatus ?? 'Closed').toLowerCase();
    let status: MarketStatus['status'] = 'Closed';
    if (statusRaw.includes('open') && !statusRaw.includes('pre') && !statusRaw.includes('post')) {
      status = 'Open';
    } else if (statusRaw.includes('pre')) {
      status = 'Pre-open';
    } else if (statusRaw.includes('post')) {
      status = 'Post-close';
    }

    return {
      market: segment?.market ?? 'Capital Market',
      status,
      timestamp: segment?.tradeDate ?? new Date().toISOString(),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async getIndexQuote(symbol: string): Promise<QuoteData> {
    const raw = await this.nseFetch<NseAllIndicesResponse>('/api/allIndices');
    const idx = raw.data?.find(
      (d) => d.index?.toUpperCase() === symbol.toUpperCase() ||
             d.indexSymbol?.toUpperCase() === symbol.toUpperCase(),
    );

    if (!idx) {
      throw new Error(`Index "${symbol}" not found in /api/allIndices`);
    }

    return {
      symbol,
      lastPrice: idx.last ?? 0,
      change: idx.variation ?? 0,
      pChange: idx.percentChange ?? 0,
      open: idx.open ?? 0,
      high: idx.high ?? 0,
      low: idx.low ?? 0,
      close: idx.previousClose ?? 0,
      volume: 0, // indices don't have volume in this endpoint
      timestamp: idx.timeVal ?? new Date().toISOString(),
    };
  }

  /**
   * Map the raw NSE option-chain JSON into our normalised OptionChainData.
   * If `filterExpiry` is supplied only rows matching that expiry are included.
   */
  private mapOptionChain(
    symbol: string,
    raw: NseOptionChainResponse,
    filterExpiry?: string,
  ): OptionChainData {
    const records = raw.records ?? {};
    const filtered = raw.filtered ?? {};

    const allExpiryDates = (records.expiryDates ?? []).map(parseNSEDate);
    const allStrikePrices = (records.strikePrices ?? []) as number[];
    const underlyingValue =
      typeof records.underlyingValue === 'number'
        ? records.underlyingValue
        : 0;

    // Determine the effective expiry to use.
    let targetExpiry: string | undefined;
    if (filterExpiry) {
      // Normalise: the caller might pass ISO or NSE format.
      targetExpiry = filterExpiry.includes('-') && filterExpiry.length === 10
        ? filterExpiry
        : parseNSEDate(filterExpiry);
    }

    // Choose between records.data (all) and filtered.data (near-money).
    const dataArray: NseOptionChainRow[] =
      records.data ?? filtered.data ?? [];

    const rowMap = new Map<string, OptionChainRow>();

    for (const entry of dataArray) {
      const iso = parseNSEDate(entry.expiryDate);
      if (targetExpiry && iso !== targetExpiry) continue;

      const key = `${iso}|${entry.strikePrice}`;
      let row = rowMap.get(key);
      if (!row) {
        row = { strikePrice: entry.strikePrice, expiryDate: iso };
        rowMap.set(key, row);
      }

      if (entry.CE) row.CE = this.mapOptionLeg(entry.CE, 'CE', iso);
      if (entry.PE) row.PE = this.mapOptionLeg(entry.PE, 'PE', iso);
    }

    const rows = Array.from(rowMap.values()).sort(
      (a, b) => a.strikePrice - b.strikePrice,
    );

    const effectiveExpiry = targetExpiry ?? allExpiryDates[0] ?? '';

    // Totals – prefer the filtered aggregates when available.
    let totalCEOI = 0;
    let totalPEOI = 0;
    let totalCEVol = 0;
    let totalPEVol = 0;

    if (filtered.CE) {
      totalCEOI = filtered.CE.totOI ?? 0;
      totalCEVol = filtered.CE.totVol ?? 0;
    }
    if (filtered.PE) {
      totalPEOI = filtered.PE.totOI ?? 0;
      totalPEVol = filtered.PE.totVol ?? 0;
    }

    // If totals are zero (e.g. we filtered to a specific expiry), compute from rows.
    if (totalCEOI === 0 && totalPEOI === 0) {
      for (const r of rows) {
        totalCEOI += r.CE?.openInterest ?? 0;
        totalPEOI += r.PE?.openInterest ?? 0;
        totalCEVol += r.CE?.totalTradedVolume ?? 0;
        totalPEVol += r.PE?.totalTradedVolume ?? 0;
      }
    }

    return {
      symbol,
      underlyingValue,
      expiryDate: effectiveExpiry,
      expiryDates: allExpiryDates,
      strikePrices: allStrikePrices,
      rows,
      timestamp: records.timestamp ?? new Date().toISOString(),
      totalCEOpenInterest: totalCEOI,
      totalPEOpenInterest: totalPEOI,
      totalCEVolume: totalCEVol,
      totalPEVolume: totalPEVol,
    };
  }

  private mapOptionLeg(
    leg: NseOptionLeg,
    type: 'CE' | 'PE',
    expiryIso: string,
  ): OptionData {
    return {
      strikePrice: leg.strikePrice ?? 0,
      expiryDate: expiryIso,
      optionType: type,
      lastPrice: leg.lastPrice ?? 0,
      change: leg.change ?? 0,
      pChange: leg.pChange ?? 0,
      openInterest: leg.openInterest ?? 0,
      changeinOpenInterest: leg.changeinOpenInterest ?? 0,
      totalTradedVolume: leg.totalTradedVolume ?? 0,
      impliedVolatility: leg.impliedVolatility ?? 0,
      bidQty: leg.bidQty ?? 0,
      bidPrice: leg.bidprice ?? leg.bidPrice ?? 0,
      askQty: leg.askQty ?? 0,
      askPrice: leg.askPrice ?? 0,
      underlyingValue: leg.underlyingValue ?? 0,
    };
  }
}

// ── NSE raw JSON shapes (internal) ───────────────────────────────────────

interface NseOptionLeg {
  strikePrice?: number;
  expiryDate?: string;
  openInterest?: number;
  changeinOpenInterest?: number;
  totalTradedVolume?: number;
  impliedVolatility?: number;
  lastPrice?: number;
  change?: number;
  pChange?: number;
  bidQty?: number;
  bidprice?: number;
  bidPrice?: number;
  askQty?: number;
  askPrice?: number;
  underlyingValue?: number;
}

interface NseOptionChainRow {
  strikePrice: number;
  expiryDate: string;
  CE?: NseOptionLeg;
  PE?: NseOptionLeg;
}

interface NseOptionChainResponse {
  records?: {
    expiryDates?: string[];
    strikePrices?: number[];
    data?: NseOptionChainRow[];
    timestamp?: string;
    underlyingValue?: number;
  };
  filtered?: {
    data?: NseOptionChainRow[];
    CE?: { totOI?: number; totVol?: number };
    PE?: { totOI?: number; totVol?: number };
  };
}

interface NseEquityQuoteResponse {
  priceInfo?: {
    lastPrice?: number;
    change?: number;
    pChange?: number;
    open?: number;
    close?: number;
    previousClose?: number;
    intraDayHighLow?: { min?: number; max?: number };
    weekHighLow?: { min?: number; max?: number };
  };
  securityWiseDP?: {
    quantityTraded?: number;
  };
  metadata?: {
    lastUpdateTime?: string;
  };
}

interface NseAllIndicesResponse {
  data?: Array<{
    index?: string;
    indexSymbol?: string;
    last?: number;
    variation?: number;
    percentChange?: number;
    open?: number;
    high?: number;
    low?: number;
    previousClose?: number;
    timeVal?: string;
  }>;
}

interface NseMarketStatusResponse {
  marketState?: Array<{
    market?: string;
    marketStatus?: string;
    tradeDate?: string;
  }>;
}

interface NseLiveDerivativesRow {
  underlying?: string;
  identifier?: string;
  instrumentType?: string;
  instrument?: string;
  contract?: string;
  expiryDate?: string;
  optionType?: string;
  strikePrice?: number;
  lastPrice?: number;
  change?: number;
  pChange?: number;
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  closePrice?: number;
  volume?: number;
  totalTurnover?: number;
  value?: number;
  premiumTurnOver?: number;
  underlyingValue?: number;
  openInterest?: number;
  noOfTrades?: number;
}

interface NseLiveDerivativesResponse {
  data?: NseLiveDerivativesRow[];
  timestamp?: string;
  marketStatus?: {
    market?: string;
    marketOpenOrClose?: string;
    marketStatusMessage?: string;
  };
}
