/**
 * @module data/constants/expiry-calendar
 * @description Expiry date computation for NSE F&O contracts.
 *
 * **NSE Expiry Rules (2025–2026):**
 *
 * - **Weekly expiries** (indices only):
 *   - NIFTY — Thursday
 *   - BANKNIFTY — Wednesday
 *   - FINNIFTY — Tuesday
 *   - MIDCPNIFTY — Monday
 *   - SENSEX — Friday
 *
 * - **Monthly expiries** (all stocks & indices):
 *   - Last Thursday of the calendar month.
 *
 * - If the computed expiry day is an exchange holiday, it shifts to the
 *   **previous trading day** (i.e. backward, not forward).
 *
 * This module provides helpers to compute the next expiry, list upcoming
 * expiries, and check whether today is an expiry day.
 */

// ---------------------------------------------------------------------------
// NSE Holidays — 2026
// ---------------------------------------------------------------------------

/**
 * NSE trading holidays for calendar year 2026.
 *
 * Dates are midnight UTC strings.  This list is sourced from the NSE
 * circular "Trading Holidays" published at the start of each year.
 *
 * @see https://www.nseindia.com/regulations/trading-holidays
 */
const NSE_HOLIDAYS_2026: ReadonlySet<string> = new Set([
  '2026-01-26', // Republic Day
  '2026-03-10', // Maha Shivaratri
  '2026-03-17', // Holi
  '2026-03-31', // Id-Ul-Fitr (Eid)
  '2026-04-02', // Ram Navami
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-05-25', // Buddha Purnima
  '2026-06-07', // Id-Ul-Adha (Bakrid)
  '2026-07-06', // Muharram
  '2026-08-15', // Independence Day
  '2026-08-16', // Parsi New Year
  '2026-09-04', // Milad-un-Nabi
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-20', // Dussehra
  '2026-11-09', // Diwali (Laxmi Puja)
  '2026-11-10', // Diwali Balipratipada
  '2026-11-27', // Guru Nanak Jayanti
  '2026-12-25', // Christmas
]);

/**
 * Combined holiday set including 2025 (for look-backs) and 2026.
 * Add more years as needed.
 */
const NSE_HOLIDAYS_2025: ReadonlySet<string> = new Set([
  '2025-02-26', // Maha Shivaratri
  '2025-03-14', // Holi
  '2025-03-31', // Id-Ul-Fitr
  '2025-04-10', // Shri Mahavir Jayanti
  '2025-04-14', // Dr. Ambedkar Jayanti
  '2025-04-18', // Good Friday
  '2025-05-01', // Maharashtra Day
  '2025-05-12', // Buddha Purnima
  '2025-06-07', // Id-Ul-Adha (Bakrid)
  '2025-07-06', // Muharram
  '2025-08-15', // Independence Day
  '2025-08-16', // Parsi New Year
  '2025-09-05', // Milad-un-Nabi
  '2025-10-02', // Mahatma Gandhi Jayanti
  '2025-10-21', // Dussehra
  '2025-10-22', // Dussehra (additional)
  '2025-11-05', // Diwali (Laxmi Puja)
  '2025-11-26', // Guru Nanak Jayanti
  '2025-12-25', // Christmas
]);

// ---------------------------------------------------------------------------
// Helpers: Holiday / Trading Day
// ---------------------------------------------------------------------------

/**
 * Format a Date as `YYYY-MM-DD` in UTC.
 */
function toDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Check whether a given date is an NSE holiday.
 *
 * @param date - The date to check.
 * @returns `true` if the date falls on a known NSE trading holiday.
 */
export function isNseHoliday(date: Date): boolean {
  const key = toDateKey(date);
  return NSE_HOLIDAYS_2025.has(key) || NSE_HOLIDAYS_2026.has(key);
}

/**
 * Check whether a date is a weekend (Saturday or Sunday).
 */
function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Check whether a date is a valid trading day (not a weekend and not a holiday).
 *
 * @param date - The date to check.
 */
export function isTradingDay(date: Date): boolean {
  return !isWeekend(date) && !isNseHoliday(date);
}

/**
 * Shift a date backward to the previous trading day if it falls on a
 * weekend or holiday.  Returns the date unchanged if it is already a
 * trading day.
 *
 * @param date - The candidate date (mutated in place for efficiency).
 */
function shiftToPreviousTradingDay(date: Date): Date {
  const result = new Date(date);
  while (!isTradingDay(result)) {
    result.setUTCDate(result.getUTCDate() - 1);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Weekly Expiry Day Mapping
// ---------------------------------------------------------------------------

/**
 * Day-of-week for weekly expiry, keyed by uppercase symbol.
 *
 * | Symbol      | Day       | `getUTCDay()` |
 * | ----------- | --------- | ------------- |
 * | NIFTY       | Thursday  | 4             |
 * | BANKNIFTY   | Wednesday | 3             |
 * | FINNIFTY    | Tuesday   | 2             |
 * | MIDCPNIFTY  | Monday    | 1             |
 * | SENSEX      | Friday    | 5             |
 */
const WEEKLY_EXPIRY_DAY: Readonly<Record<string, number>> = {
  NIFTY: 4,       // Thursday
  BANKNIFTY: 3,   // Wednesday
  FINNIFTY: 2,    // Tuesday
  MIDCPNIFTY: 1,  // Monday
  SENSEX: 5,      // Friday
};

/**
 * Monthly expiry day-of-week — last **Thursday** of the month for all symbols.
 */
const MONTHLY_EXPIRY_DOW = 4; // Thursday

// ---------------------------------------------------------------------------
// Core Expiry Computation
// ---------------------------------------------------------------------------

/**
 * Find the next occurrence of a given day-of-week on or after `from`.
 */
function nextDayOfWeek(from: Date, dow: number): Date {
  const result = new Date(from);
  const diff = (dow - result.getUTCDay() + 7) % 7;
  result.setUTCDate(result.getUTCDate() + (diff === 0 ? 0 : diff));
  return result;
}

/**
 * Find the last occurrence of a given day-of-week in a specific month/year.
 */
function lastDayOfWeekInMonth(
  year: number,
  month: number,
  dow: number,
): Date {
  // Start from the last day of the month and walk backward.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)); // day 0 of next month = last day
  const diff = (lastDay.getUTCDay() - dow + 7) % 7;
  lastDay.setUTCDate(lastDay.getUTCDate() - diff);
  return lastDay;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the next expiry date for a given symbol.
 *
 * @param symbol  - NSE symbol (e.g. `"NIFTY"`, `"BANKNIFTY"`, `"RELIANCE"`).
 * @param weekly  - If `true`, return the next weekly expiry (indices only).
 *                  If `false` or omitted, return the next monthly expiry.
 *                  For stock symbols, weekly is always ignored (stocks only
 *                  have monthly expiries).
 * @param from    - Reference date; defaults to now.
 * @returns The next expiry as a UTC midnight `Date`.
 *
 * @example
 * ```ts
 * getNextExpiry('NIFTY', true);   // Next weekly NIFTY expiry (Thursday)
 * getNextExpiry('RELIANCE');      // Next monthly RELIANCE expiry
 * ```
 */
export function getNextExpiry(
  symbol: string,
  weekly = false,
  from: Date = new Date(),
): Date {
  const upper = symbol.toUpperCase().trim();
  const today = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );

  if (weekly && upper in WEEKLY_EXPIRY_DAY) {
    // Weekly expiry for this index
    const dow = WEEKLY_EXPIRY_DAY[upper]!;
    let candidate = nextDayOfWeek(today, dow);
    candidate = shiftToPreviousTradingDay(candidate);

    // If the adjusted expiry is in the past (before today), skip to next week
    if (candidate < today) {
      const nextWeek = new Date(today);
      nextWeek.setUTCDate(nextWeek.getUTCDate() + 1);
      candidate = nextDayOfWeek(nextWeek, dow);
      candidate = shiftToPreviousTradingDay(candidate);
    }
    return candidate;
  }

  // Monthly expiry — last Thursday of the current month, or next if passed
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();

  let candidate = shiftToPreviousTradingDay(
    lastDayOfWeekInMonth(year, month, MONTHLY_EXPIRY_DOW),
  );

  if (candidate < today) {
    // This month's monthly expiry is past — move to next month
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = shiftToPreviousTradingDay(
      lastDayOfWeekInMonth(year, month, MONTHLY_EXPIRY_DOW),
    );
  }

  return candidate;
}

/**
 * Get the monthly expiry date for a specific month and year.
 *
 * @param month - 0-indexed month (0 = January). Defaults to current month.
 * @param year  - 4-digit year. Defaults to current year.
 * @returns The monthly expiry `Date` (last Thursday, adjusted for holidays).
 *
 * @example
 * ```ts
 * getCurrentMonthExpiry(5, 2025); // June 2025 monthly expiry
 * getCurrentMonthExpiry();        // Current month's monthly expiry
 * ```
 */
export function getCurrentMonthExpiry(
  month?: number,
  year?: number,
): Date {
  const now = new Date();
  const y = year ?? now.getUTCFullYear();
  const m = month ?? now.getUTCMonth();
  return shiftToPreviousTradingDay(
    lastDayOfWeekInMonth(y, m, MONTHLY_EXPIRY_DOW),
  );
}

/**
 * List all upcoming expiry dates for a symbol over the next N months.
 *
 * For indices with weekly expiries, all weekly expiries are included.
 * For stocks, only monthly expiries are returned.
 *
 * @param symbol - NSE symbol.
 * @param months - Number of months to look ahead (default: 3).
 * @returns Sorted array of expiry `Date` objects.
 *
 * @example
 * ```ts
 * getAllExpiries('NIFTY', 2);  // All NIFTY weeklies + monthlies for 2 months
 * getAllExpiries('RELIANCE');  // Next 3 monthly expiries
 * ```
 */
export function getAllExpiries(symbol: string, months = 3): Date[] {
  const upper = symbol.toUpperCase().trim();
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const endDate = new Date(todayUtc);
  endDate.setUTCMonth(endDate.getUTCMonth() + months);

  const expiries: Date[] = [];
  const seen = new Set<string>();

  const hasWeekly = upper in WEEKLY_EXPIRY_DAY;

  if (hasWeekly) {
    // Generate weekly expiries
    const dow = WEEKLY_EXPIRY_DAY[upper]!;
    let cursor = nextDayOfWeek(todayUtc, dow);
    if (shiftToPreviousTradingDay(new Date(cursor)) < todayUtc) {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }

    while (cursor <= endDate) {
      const adjusted = shiftToPreviousTradingDay(new Date(cursor));
      const key = toDateKey(adjusted);
      if (!seen.has(key) && adjusted >= todayUtc) {
        seen.add(key);
        expiries.push(adjusted);
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  // Monthly expiries (all symbols get these)
  let y = todayUtc.getUTCFullYear();
  let m = todayUtc.getUTCMonth();

  for (let i = 0; i < months + 1; i++) {
    const monthly = shiftToPreviousTradingDay(
      lastDayOfWeekInMonth(y, m, MONTHLY_EXPIRY_DOW),
    );
    const key = toDateKey(monthly);
    if (!seen.has(key) && monthly >= todayUtc) {
      seen.add(key);
      expiries.push(monthly);
    }
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }

  return expiries.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Check whether a given date is an F&O expiry day.
 *
 * Tests against weekly expiry days for all indices and the monthly expiry
 * (last Thursday).  The date must also be a trading day.
 *
 * @param date - The date to check. Defaults to today.
 * @returns `true` if the date is an expiry day for any NSE F&O contract.
 *
 * @example
 * ```ts
 * isExpiryDay();                           // Is today an expiry?
 * isExpiryDay(new Date('2025-06-05'));      // Is June 5, 2025 an expiry?
 * ```
 */
export function isExpiryDay(date: Date = new Date()): boolean {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

  if (!isTradingDay(d)) {
    return false;
  }

  const dow = d.getUTCDay();

  // Check weekly expiry days for any index
  const weeklyDays = new Set(Object.values(WEEKLY_EXPIRY_DAY));
  if (weeklyDays.has(dow)) {
    // Verify it's actually the expiry (not shifted due to a holiday on the real expiry day)
    // A date is a weekly expiry if it's the adjusted expiry for some index this week
    for (const [sym, expiryDow] of Object.entries(WEEKLY_EXPIRY_DAY)) {
      // Find the target day this week
      const target = nextDayOfWeek(
        new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 6)),
        expiryDow,
      );
      // Ensure target is in the same week
      if (target >= new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 6))) {
        const adjusted = shiftToPreviousTradingDay(target);
        if (toDateKey(adjusted) === toDateKey(d)) {
          void sym; // used only for iteration
          return true;
        }
      }
    }
  }

  // Check if it's the monthly expiry (last Thursday, possibly shifted)
  const monthlyTarget = lastDayOfWeekInMonth(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    MONTHLY_EXPIRY_DOW,
  );
  const adjustedMonthly = shiftToPreviousTradingDay(monthlyTarget);
  if (toDateKey(adjustedMonthly) === toDateKey(d)) {
    return true;
  }

  return false;
}

/**
 * Get the list of NSE holidays for a given year.
 *
 * @param year - Calendar year (currently supports 2025 and 2026).
 * @returns Array of holiday date strings (`YYYY-MM-DD`), sorted chronologically.
 */
export function getNseHolidays(year: number): string[] {
  switch (year) {
    case 2025:
      return [...NSE_HOLIDAYS_2025].sort();
    case 2026:
      return [...NSE_HOLIDAYS_2026].sort();
    default:
      return [];
  }
}
