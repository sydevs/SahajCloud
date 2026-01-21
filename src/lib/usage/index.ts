/**
 * Usage Plugin
 *
 * Consolidates rate limiting and usage tracking into a single plugin.
 *
 * @example
 * ```typescript
 * import { usagePlugin } from '@/lib/usage'
 *
 * plugins: [
 *   usagePlugin({ enabled: true }),
 * ]
 * ```
 */

// Main plugin export
export { usagePlugin } from './usagePlugin'

// Type exports
export type { TrackUsageInput, UsagePluginOptions } from './types'
export {
  CONSUMER_COLLECTIONS,
  HIGH_USAGE_THRESHOLD,
  RateLimitExceededError,
  RateLimitValidationError,
  STATS_FIELD_PATH,
  SYSTEM_EXCLUSIONS,
} from './types'

// Hook factories (for testing)
export { createRateLimitHook, createUsageTrackingHook } from './hooks'

// Rate limiting utilities (for testing)
export { buildRateLimitKey, validateUserId } from './hooks'

// Task configs (for testing)
export { resetUsageTask, trackUsageTask } from './tasks'
