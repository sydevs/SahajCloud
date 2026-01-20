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
 *   usagePlugin({
 *     consumers: [{
 *       collection: 'clients',
 *       statsFieldPath: 'usage',
 *       highUsageThreshold: 1000,
 *     }],
 *   }),
 * ]
 * ```
 */

// Main plugin export
export { usagePlugin } from './usagePlugin'

// Type exports
export type { ConsumerConfig, TrackUsageInput, UsagePluginOptions } from './types'
export { RateLimitExceededError, RateLimitValidationError, SYSTEM_EXCLUSIONS } from './types'

// Hook factories (for testing)
export { createInitStatsHook, createRateLimitHook, createUsageTrackingHook } from './hooks'

// Rate limiting utilities (for testing)
export { buildRateLimitKey, validateUserId } from './hooks'

// Task factories (for testing)
export { createResetUsageTask, createTrackUsageTask } from './tasks'
