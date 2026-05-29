// ────────────────────────────────────────────────────────────────────────────
// Provider Factory
//
// Creates the appropriate DataProvider instance based on configuration.
// Falls back to the free NSE provider when no Zerodha credentials are given.
// ────────────────────────────────────────────────────────────────────────────

import type { DataProvider } from './providers/base.provider.js';
import { NSEProvider } from './providers/nse.provider.js';
import { ZerodhaProvider } from './providers/zerodha.provider.js';

/**
 * Minimal config shape expected by the factory.
 * In a real project this would be imported from `../config.js`.
 */
interface ProviderConfig {
  dataProvider?: 'nse' | 'zerodha';
  kiteApiKey?: string;
  kiteApiSecret?: string;
  kiteAccessToken?: string;
}

/**
 * Build the config from environment variables so the factory is
 * self-contained even if the main config module doesn't exist yet.
 */
function loadConfig(): ProviderConfig {
  return {
    dataProvider:
      (process.env.DATA_PROVIDER as ProviderConfig['dataProvider']) ?? 'nse',
    kiteApiKey: process.env.KITE_API_KEY,
    kiteApiSecret: process.env.KITE_API_SECRET,
    kiteAccessToken: process.env.KITE_ACCESS_TOKEN,
  };
}

/**
 * Create and return a DataProvider based on the current configuration.
 *
 * - `DATA_PROVIDER=zerodha` → ZerodhaProvider (requires KITE_API_KEY +
 *   KITE_ACCESS_TOKEN)
 * - anything else → NSEProvider (free, no credentials needed)
 */
export function createDataProvider(
  overrideConfig?: Partial<ProviderConfig>,
): DataProvider {
  const cfg = { ...loadConfig(), ...overrideConfig };

  if (cfg.dataProvider === 'zerodha') {
    if (!cfg.kiteApiKey || !cfg.kiteAccessToken) {
      console.error(
        '[ProviderFactory] DATA_PROVIDER is "zerodha" but KITE_API_KEY / ' +
          'KITE_ACCESS_TOKEN are missing — falling back to NSE provider.',
      );
      return new NSEProvider();
    }

    console.error('[ProviderFactory] Using Zerodha (Kite Connect) provider.');
    return new ZerodhaProvider(
      cfg.kiteApiKey,
      cfg.kiteApiSecret ?? '',
      cfg.kiteAccessToken,
    );
  }

  console.error('[ProviderFactory] Using NSE India provider (free).');
  return new NSEProvider();
}
