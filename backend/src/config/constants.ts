/**
 * Application-wide constants
 * Single source of truth for shared configuration values
 */

export const WEBHOOK_CONFIG = {
  MAX_ATTEMPTS: 5,
  BACKOFF_TYPE: 'exponential' as const,
  INITIAL_DELAY_MS: 1000,
} as const;

export const RATE_LIMIT_DEFAULTS = {
  WINDOW_MS: 60000, // 1 minute
  DEFAULT_LIMIT: 1000,
} as const;

export const PAGINATION_DEFAULTS = {
  MAX_LIMIT: 100,
  DEFAULT_LIMIT: 20,
} as const;
