/**
 * Environment Variable Validation with Zod
 *
 * This is the barrel export for server-side environment validation.
 * For backwards compatibility, importing from `@/lib/env` works for server code.
 *
 * **IMPORTANT**: This module should ONLY be imported from server-side code.
 * For client-side code, use `@/lib/env/client` instead.
 *
 * **Architecture**:
 * - `@/lib/env/client` - Client-accessible variables (NEXT_PUBLIC_* prefix)
 * - `@/lib/env/server` - Server-only variables (includes all client vars)
 * - `@/lib/env` (this file) - Barrel export for server (backwards compatible)
 *
 * **Usage**:
 * ```typescript
 * // Server-side
 * import { serverEnv } from '@/lib/env'
 * const secret = serverEnv.PAYLOAD_SECRET
 *
 * // Client-side - use the client module directly
 * import { clientEnv } from '@/lib/env/client'
 * const logLevel = clientEnv.NEXT_PUBLIC_LOG_LEVEL
 * ```
 */

// Re-export everything from server module for backwards compatibility
export { clientEnv, serverEnv } from './server'
export type { ClientEnv, ServerEnv } from './server'
