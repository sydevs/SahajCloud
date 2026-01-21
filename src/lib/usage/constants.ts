/**
 * Usage Plugin Types
 *
 * Type definitions for the usage tracking and rate limiting plugin.
 */

import type { CollectionSlug } from 'payload'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Daily request threshold for high usage alerts.
 */
export const HIGH_USAGE_THRESHOLD = 1000

/**
 * Rate limit: maximum requests per period.
 * Must be kept in sync with wrangler.toml [[ratelimits]] configuration.
 */
export const RATE_LIMIT_MAX_REQUESTS = 500

/**
 * Rate limit period in seconds.
 * Must be kept in sync with wrangler.toml [[ratelimits]] configuration.
 */
export const RATE_LIMIT_PERIOD_SECONDS = 60

/**
 * System collections always excluded from usage tracking and rate limiting.
 * These are Payload internal collections that should never be rate limited.
 */
export const SYSTEM_EXCLUSIONS: CollectionSlug[] = [
  'payload-preferences' as CollectionSlug,
  'payload-migrations' as CollectionSlug,
  'payload-jobs' as CollectionSlug,
  'payload-job-stats' as CollectionSlug,
  'payload-locked-documents' as CollectionSlug,
  'payload-kv' as CollectionSlug,
]


