/**
 * Environment Variable Validation with Zod
 *
 * This is the barrel export for server-side environment validation.
 * For backwards compatibility, importing from `@/lib/env` works for server code.
 *
 * **IMPORTANT**: This module should ONLY be imported from server-side code.
 * `serverEnv` throws when it is read in a browser bundle.
 *
 * **Architecture**:
 * - `@/lib/env/client` - the `NEXT_PUBLIC_*` schema, which the server schema extends
 * - `@/lib/env/server` - every variable, client ones included, validated lazily
 * - `@/lib/env` (this file) - Barrel export for server (backwards compatible)
 *
 * **Usage**:
 * ```typescript
 * // Server-side — including the NEXT_PUBLIC_* values, which are validated here
 * import { serverEnv } from '@/lib/env'
 * const secret = serverEnv.PAYLOAD_SECRET
 * const logLevel = serverEnv.NEXT_PUBLIC_LOG_LEVEL
 *
 * // Browser — a literal member expression, the only form Next substitutes (#760)
 * const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
 * ```
 */

// Re-export everything from server module for backwards compatibility
export { serverEnv } from './server'
export type { ClientEnv, ServerEnv } from './server'
