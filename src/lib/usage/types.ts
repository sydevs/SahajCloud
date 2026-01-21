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
 * API consumer collections that can make API requests.
 * These collections are excluded from rate limiting (they ARE the rate-limited entity).
 */
export const API_CONSUMER_COLLECTIONS: CollectionSlug[] = ['clients']

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
// API CONSUMER TYPES
// ============================================================================

/**
 * Usage statistics stored on API consumer documents (e.g., clients)
 */
export interface ApiConsumerStats {
  dailyRequests?: number | null
  peakDailyRequests?: number | null
  lastRequestAt?: string | null
}

/**
 * API consumer document with usage stats (minimal interface for type safety)
 */
export interface ApiConsumerWithStats {
  id: number | string
  name?: string
  usage?: ApiConsumerStats
}

