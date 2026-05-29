/**
 * @module config
 * @description Zod-validated application configuration loaded from environment variables.
 *
 * All configuration is read from `process.env` at import time and validated
 * against a strict Zod schema. Invalid or missing values cause an immediate,
 * descriptive error so misconfigurations are caught at startup — not at runtime.
 *
 * **Important:** This module must never use `console.log` — all diagnostic
 * output goes to `console.error` to protect the MCP stdio transport.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** Zod schema for the full application configuration. */
const ConfigSchema = z.object({
  /**
   * Which market data provider to use.
   * - `"nse"` — scrapes public NSE India endpoints (free, no credentials).
   * - `"zerodha"` — uses the Kite Connect REST API (needs API key + token).
   */
  DATA_PROVIDER: z
    .enum(['nse', 'zerodha'])
    .default('nse')
    .describe('Market data provider'),

  /**
   * Kite Connect API key — required only when `DATA_PROVIDER` is `"zerodha"`.
   * Obtain from https://developers.kite.trade/.
   */
  KITE_API_KEY: z
    .string()
    .optional()
    .describe('Zerodha Kite API key'),

  /**
   * Kite Connect API secret — required only when `DATA_PROVIDER` is `"zerodha"`.
   */
  KITE_API_SECRET: z
    .string()
    .optional()
    .describe('Zerodha Kite API secret'),

  /**
   * Kite Connect session access token — required only when `DATA_PROVIDER`
   * is `"zerodha"`. Needs to be refreshed daily via the Kite login flow.
   */
  KITE_ACCESS_TOKEN: z
    .string()
    .optional()
    .describe('Zerodha Kite access token'),

  /**
   * How long (in seconds) to cache real-time market data (quotes, option
   * chains) before re-fetching from the provider.
   *
   * @default 5
   */
  CACHE_TTL_SECONDS: z
    .coerce.number()
    .int()
    .min(1)
    .max(300)
    .default(5)
    .describe('Cache TTL for real-time data in seconds'),

  /**
   * How long (in hours) to cache the instrument master list.
   * The NSE instrument dump is regenerated once a day, so 12 h is a safe default.
   *
   * @default 12
   */
  INSTRUMENT_CACHE_TTL_HOURS: z
    .coerce.number()
    .min(1)
    .max(168)
    .default(12)
    .describe('Cache TTL for the instrument master file in hours'),

  /**
   * Annual risk-free interest rate used in Black-Scholes pricing and Greeks
   * calculations. The default of 0.07 (7 %) reflects the yield on Indian
   * 10-year government bonds as of 2025.
   *
   * @default 0.07
   */
  RISK_FREE_RATE: z
    .coerce.number()
    .min(0)
    .max(1)
    .default(0.07)
    .describe('Risk-free interest rate (annualised)'),

  /**
   * Minimum log level written to stderr.
   *
   * @default "info"
   */
  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'])
    .default('info')
    .describe('Logging verbosity'),
});

// ---------------------------------------------------------------------------
// Refinement — cross-field validation
// ---------------------------------------------------------------------------

const RefinedConfigSchema = ConfigSchema.superRefine((cfg, ctx) => {
  if (cfg.DATA_PROVIDER === 'zerodha') {
    if (!cfg.KITE_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['KITE_API_KEY'],
        message: 'KITE_API_KEY is required when DATA_PROVIDER is "zerodha".',
      });
    }
    if (!cfg.KITE_API_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['KITE_API_SECRET'],
        message: 'KITE_API_SECRET is required when DATA_PROVIDER is "zerodha".',
      });
    }
    if (!cfg.KITE_ACCESS_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['KITE_ACCESS_TOKEN'],
        message:
          'KITE_ACCESS_TOKEN is required when DATA_PROVIDER is "zerodha".',
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Type export
// ---------------------------------------------------------------------------

/** Fully validated application configuration object. */
export type AppConfig = z.infer<typeof ConfigSchema>;

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Parse and validate configuration from the current `process.env`.
 *
 * @returns A frozen, fully-typed {@link AppConfig} object.
 * @throws {ZodError} When one or more environment variables are invalid.
 */
export function loadConfig(): AppConfig {
  const result = RefinedConfigSchema.safeParse({
    DATA_PROVIDER: process.env['DATA_PROVIDER'],
    KITE_API_KEY: process.env['KITE_API_KEY'],
    KITE_API_SECRET: process.env['KITE_API_SECRET'],
    KITE_ACCESS_TOKEN: process.env['KITE_ACCESS_TOKEN'],
    CACHE_TTL_SECONDS: process.env['CACHE_TTL_SECONDS'],
    INSTRUMENT_CACHE_TTL_HOURS: process.env['INSTRUMENT_CACHE_TTL_HOURS'],
    RISK_FREE_RATE: process.env['RISK_FREE_RATE'],
    LOG_LEVEL: process.env['LOG_LEVEL'],
  });

  if (!result.success) {
    // Pretty-print validation errors to stderr so the operator can fix them.
    const messages = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(
      `[indian-option-mcp] ❌ Invalid configuration:\n${messages}`,
    );
    throw result.error;
  }

  return Object.freeze(result.data);
}

// ---------------------------------------------------------------------------
// Singleton — eagerly validated at import time
// ---------------------------------------------------------------------------

/**
 * The application-wide configuration singleton.
 *
 * Accessing this constant triggers immediate validation so misconfigurations
 * surface at startup rather than at some unpredictable later point.
 *
 * @example
 * ```ts
 * import { config } from './config.js';
 * console.error(`Using ${config.DATA_PROVIDER} provider`);
 * ```
 */
export const config: AppConfig = loadConfig();
