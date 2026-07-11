/**
 * Usage Plugin
 *
 * Consolidates rate limiting and usage tracking into a single plugin.
 *
 * @example
 * ```typescript
 * import { usagePlugin } from '@/plugins/usage'
 *
 * plugins: [
 *   usagePlugin({ enabled: true }),
 * ]
 * ```
 */

// Main plugin export
export { usagePlugin } from './usagePlugin'

// Constant exports
export {
  HIGH_USAGE_THRESHOLD,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_PERIOD_SECONDS,
  SYSTEM_EXCLUSIONS,
} from './constants'

// Hook exports (for testing)
export { rateLimitHook, usageTrackingBeforeOperationHook, validateClientOriginHook } from './hooks'

// Origin/Referer enforcement helpers (for testing)
export {
  extractRequestHost,
  isHostAllowed,
  normalizeHost,
  parseAllowedDomains,
} from './originEnforcement'

// Rate limiting utilities (for testing)
export { buildRateLimitKey } from './hooks'

// Task configs (for testing)
export { resetUsageTask } from './tasks'

// Abuse detection utilities
export { calculateAbuseScore, type AbuseLevel, type AbuseScore } from './abuse'
