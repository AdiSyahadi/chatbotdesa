/**
 * Application-wide constants
 * Single source of truth for shared configuration values
 */

export const WEBHOOK_CONFIG = {
  MAX_ATTEMPTS: 5,
  BACKOFF_TYPE: 'exponential' as const,
  INITIAL_DELAY_MS: 1000,
  TIMEOUT_MS: 30_000,
  RESPONSE_TRUNCATE_LENGTH: 5000,
  BACKOFF_BASE_MS: 5000,
  REMOVE_ON_COMPLETE_COUNT: 1000,
  REMOVE_ON_COMPLETE_AGE_S: 24 * 60 * 60, // 24 hours
  REMOVE_ON_FAIL_COUNT: 5000,
} as const;

export const RATE_LIMIT_DEFAULTS = {
  WINDOW_MS: 60000, // 1 minute
  DEFAULT_LIMIT: 1000,
} as const;

export const PAGINATION_DEFAULTS = {
  MAX_LIMIT: 100,
  DEFAULT_LIMIT: 20,
} as const;

/**
 * PATCH-080: Default country calling code.
 * Used when a phone number starts with '0' (local format) or has no country prefix.
 * Override via DEFAULT_COUNTRY_CODE env var for non-Indonesian deployments.
 */
export const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_COUNTRY_CODE || '62';

/**
 * PATCH-108: Warming phase config — single source of truth (formerly duplicated in whatsapp.schema.ts and daily-reset.worker.ts)
 */
export const WARMING_PHASE_LIMITS = {
  DAY_1_3:    { daily_limit: 100,  min_delay_ms: 5000, max_messages_per_hour: 20 },
  DAY_4_7:    { daily_limit: 300,  min_delay_ms: 3000, max_messages_per_hour: 60 },
  DAY_8_14:   { daily_limit: 600,  min_delay_ms: 2000, max_messages_per_hour: 120 },
  DAY_15_PLUS:{ daily_limit: 1000, min_delay_ms: 1000, max_messages_per_hour: 200 },
} as const;

export type WarmingPhaseType = keyof typeof WARMING_PHASE_LIMITS;

/**
 * PATCH-109: Baileys connection timing constants
 */
export const BAILEYS_CONFIG = {
  CONNECT_TIMEOUT_MS: 60_000,
  QUERY_TIMEOUT_MS: 60_000,
  KEEPALIVE_INTERVAL_MS: 25_000,
  HEALTH_CHECK_INTERVAL_MS: 15_000,
  ZOMBIE_WARN_THRESHOLD_MS: 60_000,
  ZOMBIE_KILL_THRESHOLD_MS: 120_000,
  QR_EXPIRY_MS: 120_000,
} as const;
