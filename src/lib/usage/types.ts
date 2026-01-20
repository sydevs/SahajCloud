/**
 * Usage Plugin Types
 *
 * Type definitions for the usage tracking and rate limiting plugin.
 */

import type { CollectionSlug } from 'payload'

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
   * Consumer collections that store API consumers (e.g., ['clients'])
   * These collections will receive usage initialization hooks
   */
  consumers: ConsumerConfig[]

  /**
   * Collections to exclude from rate limiting and usage tracking
   * Consumer collections and Payload system collections are always excluded automatically
   */
  exclude?: CollectionSlug[]
}

/**
 * Configuration for a consumer collection
 */
export interface ConsumerConfig {
  /** Collection slug for the consumer (e.g., 'clients') */
  collection: CollectionSlug

  /**
   * Field path for the usage statistics group
   * @default 'usage'
   */
  statsFieldPath?: string

  /**
   * Threshold for high usage alerts (requests per day)
   * Required - no default to ensure conscious configuration
   */
  highUsageThreshold: number
}

// ============================================================================
// TASK INPUTS
// ============================================================================

/**
 * Input for the trackUsage task
 */
export interface TrackUsageInput {
  consumerId: string
  consumerCollection: CollectionSlug
}

// ============================================================================
// SYSTEM EXCLUSIONS
// ============================================================================

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
 *
 * Note: User ID is intentionally NOT included in the error message for privacy.
 */
export class RateLimitExceededError extends Error {
  status = 429
  constructor() {
    super('Rate limit exceeded. Maximum 500 requests per minute.')
    this.name = 'RateLimitExceededError'
  }
}
