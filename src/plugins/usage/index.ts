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
export {
  assertClientOriginAllowed,
  rateLimitHook,
  usageTrackingBeforeOperationHook,
  validateClientOriginHook,
} from './hooks'

// Origin/Referer enforcement helpers (for testing)
export {
  extractRequestHost,
  isHostAllowed,
  normalizeHost,
  parseAllowedDomains,
} from './originEnforcement'

// Rate limiting utilities (for testing)
export { buildRateLimitKey } from './hooks'

// Raw-SQL seam — the pg pool behind Payload's adapter plus its schema, quoted.
// Shared by anything that has to write a `clients` row outside the request
// transaction (usage counters, the embed-report merge, the verification job).
export { getPgPool, quotedDbSchema } from './db'

// Task configs (for testing)
export { resetUsageTask } from './tasks'

// Abuse detection utilities
export {
  abuseScoreFieldSchema,
  abuseScoreJsonSchema,
  ABUSE_SCORE_SCHEMA_URI,
  calculateAbuseScore,
} from './abuse'
