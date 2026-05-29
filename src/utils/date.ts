/**
 * @module utils/date
 * Date utilities for Indian market expiry calculations and trading hours.
 */

/** NSE holidays 2026 (dates in YYYY-MM-DD) */
const NSE_HOLIDAYS_2026 = new Set([
  '2026-01-26', // Republic Day
  '2026-02-17', // Mahashivratri (tentative)
  '2026-03-10', // Holi
  '2026-03-30', // Id-Ul-Fitr (tentative)
  '2026-04-02', // Ram Navami
  '2026-04-03', // Mahavir Jayanti
  '2026-04-14', // Dr Ambedkar Jayanti
  '2026-04-18', // Good Friday
  '2026-05-01', // May Day
  '2026-06-06', // Id-Ul-Adha (tentative)
  '2026-07-06', // Muharram (tentative)
  '2026-08-15', // Independence Day
  '2026-08-25', // Ganesh Chaturthi (tentative)
  '2026-09-04', // Milad-un-Nabi (tentative)
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-20', // Dussehra
  '2026-10-21', // Dussehra (tentative)
  '2026-11-09', // Diwali (Lakshmi Puja)
  '2026-11-10', // Diwali Balipratipada
  '2026-11-30', // Guru Nanak Jayanti
  '2026-12-25', // Christmas
]);

/**
 * Get current time in IST (UTC+5:30).
 */
export function nowIST(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 3600000);
}

/**
 * Format a date to YYYY-MM-DD.
 */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a date for display: "30 May 2026".
 */
export function formatDateDisplay(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Parse NSE-format date strings like "29-May-2026" or "29-MAY-2026" or ISO "2026-05-29".
 */
export function parseExpiryDate(dateStr: string): Date {
  if (!dateStr) throw new Error('Empty date string');

  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00+05:30');
  }

  // NSE format: DD-Mon-YYYY
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = monthMap[parts[1].toLowerCase()];
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && month !== undefined && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  throw new Error(`Unable to parse date: ${dateStr}`);
}

/**
 * Check if a given date is a trading day (not weekend, not holiday).
 */
export function isTradingDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Weekend
  return !NSE_HOLIDAYS_2026.has(formatDateISO(date));
}

/**
 * Get the previous trading day.
 */
export function previousTradingDay(date: Date): Date {
  const prev = new Date(date);
  do {
    prev.setDate(prev.getDate() - 1);
  } while (!isTradingDay(prev));
  return prev;
}

/**
 * Calendar days to expiry from today (IST).
 */
export function daysToExpiry(expiryDate: Date | string): number {
  const expiry = typeof expiryDate === 'string' ? parseExpiryDate(expiryDate) : expiryDate;
  const now = nowIST();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expiryStart = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const diffMs = expiryStart.getTime() - todayStart.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Trading days to expiry (excludes weekends and holidays).
 */
export function tradingDaysToExpiry(expiryDate: Date | string): number {
  const expiry = typeof expiryDate === 'string' ? parseExpiryDate(expiryDate) : expiryDate;
  const now = nowIST();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expiryStart = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());

  let count = 0;
  const current = new Date(todayStart);
  current.setDate(current.getDate() + 1);

  while (current <= expiryStart) {
    if (isTradingDay(current)) count++;
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Convert days to expiry into years (for Black-Scholes T parameter).
 * Uses calendar days / 365.
 */
export function timeToExpiryYears(expiryDate: Date | string): number {
  const days = daysToExpiry(expiryDate);
  return Math.max(days / 365, 1 / (365 * 24)); // Minimum ~1 hour to avoid division by zero
}

/**
 * Check if the Indian market is currently open (9:15 AM – 3:30 PM IST, trading days only).
 */
export function isMarketOpen(): boolean {
  const now = nowIST();
  if (!isTradingDay(now)) return false;
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 9 * 60 + 15 && totalMinutes < 15 * 60 + 30;
}

/**
 * Get market status with descriptive message.
 */
export function getMarketStatusInfo(): { isOpen: boolean; message: string; nextOpen?: string } {
  const now = nowIST();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  if (!isTradingDay(now)) {
    return { isOpen: false, message: 'Market closed (holiday/weekend)' };
  }

  if (totalMinutes < 9 * 60) {
    return { isOpen: false, message: 'Market opens at 9:15 AM IST' };
  }
  if (totalMinutes < 9 * 60 + 15) {
    return { isOpen: false, message: 'Pre-open session in progress' };
  }
  if (totalMinutes < 15 * 60 + 30) {
    return { isOpen: true, message: 'Market is open' };
  }

  return { isOpen: false, message: 'Market closed for the day' };
}

/**
 * Check if today is an expiry day for the given symbol.
 */
export function isExpiryDay(date?: Date): boolean {
  const d = date ?? nowIST();
  // All index expiries are on Tuesday (2026 schedule)
  return d.getDay() === 2 && isTradingDay(d);
}
