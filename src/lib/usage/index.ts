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
export type { ApiConsumerStats, ApiConsumerWithStats } from './types'
export { API_CONSUMER_COLLECTIONS, HIGH_USAGE_THRESHOLD, SYSTEM_EXCLUSIONS } from './types'

// Hook exports (for testing)
export { rateLimitHook, usageTrackingHook } from './hooks'

// Rate limiting utilities (for testing)
export { buildRateLimitKey } from './hooks'

// Task configs (for testing)
export { resetUsageTask, trackUsageTask } from './tasks'
