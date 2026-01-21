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
 * Consumer collections that can make API requests.
 * These collections are excluded from rate limiting (they ARE the rate-limited entity).
 */
export const CONSUMER_COLLECTIONS: CollectionSlug[] = ['clients']

/**
 * Field path for usage statistics on consumer documents.
 */
export const STATS_FIELD_PATH = 'usage'

/**
 * Daily request threshold for high usage alerts.
 */
export const HIGH_USAGE_THRESHOLD = 1000

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

// ============================================================================
// PLUGIN OPTIONS
// ============================================================================

/**
 * Plugin configuration options for usagePlugin
 */
export interface UsagePluginOptions {
  /**
   * Whether to enable the plugin
   * @default true
   */
  enabled?: boolean

  /**
   * Additional collections to exclude from rate limiting and usage tracking
   */
  exclude?: CollectionSlug[]
}

// ============================================================================
// TASK INPUTS
// ============================================================================

/**
 * Input for the trackUsage task
 */
export interface TrackUsageInput {
  consumerId: string
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Custom error class for rate limit validation failures.
 * Returns 400 Bad Request for invalid X-User-ID format.
 */
export class RateLimitValidationError extends Error {
  status = 400
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitValidationError'
  }
}

/**
 * Custom error class for rate limit exceeded.
 * Returns 429 Too Many Requests.
 */
export class RateLimitExceededError extends Error {
  status = 429
  constructor() {
    super('Rate limit exceeded. Maximum 500 requests per minute.')
    this.name = 'RateLimitExceededError'
  }
}
