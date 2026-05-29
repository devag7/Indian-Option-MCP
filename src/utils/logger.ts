/**
 * @module utils/logger
 * Logger utility that writes exclusively to stderr.
 * CRITICAL: MCP servers using stdio transport must NEVER write to stdout
 * as it corrupts the JSON-RPC communication stream.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

/**
 * Set the global log level.
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, component: string, message: string, data?: unknown): void {
  if (!shouldLog(level)) return;

  const prefix = `[${formatTimestamp()}] [${level.toUpperCase()}] [${component}]`;
  const line = data
    ? `${prefix} ${message} ${JSON.stringify(data)}`
    : `${prefix} ${message}`;

  console.error(line);
}

/**
 * Create a scoped logger for a specific component.
 */
export function createLogger(component: string) {
  return {
    debug: (message: string, data?: unknown) => log('debug', component, message, data),
    info: (message: string, data?: unknown) => log('info', component, message, data),
    warn: (message: string, data?: unknown) => log('warn', component, message, data),
    error: (message: string, data?: unknown) => log('error', component, message, data),
  };
}

export const logger = createLogger('MCP');
