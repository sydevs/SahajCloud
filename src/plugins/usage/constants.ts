/**
 * Usage Plugin Types
 *
 * Type definitions for the usage tracking and rate limiting plugin.
 */

import type { CollectionSlug } from 'payload'

// --- Constants ---

/** Daily request threshold for high usage alerts. */
export const HIGH_USAGE_THRESHOLD = 1000

/**
 * Rate limit: maximum requests per period.
 * Rate limiting is enforced at the Cloudflare edge (Rate Limiting Rules); keep
 * this in sync with that rule. Retained for docs / a future app-level limiter.
 */
export const RATE_LIMIT_MAX_REQUESTS = 500

/**
 * Rate limit period in seconds.
 * Keep in sync with the Cloudflare edge Rate Limiting Rule.
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

/**
 * Largest `limit` an API client may ask for in one read (#887). Headroom, not
 * a budget — see `docs/rules/api-clients.md`.
 */
export const MAX_CLIENT_LIMIT = 2000

/**
 * Largest `page` an API client may ask for (#887). Bounding `limit` alone does
 * not bound what reaches SQL: the adapter offsets by `(page - 1) * limit`. At
 * both ceilings that offset stays under 2 × 10⁷.
 */
export const MAX_CLIENT_PAGE = 10_000
