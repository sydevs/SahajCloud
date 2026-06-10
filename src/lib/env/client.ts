/**
 * Client Environment Variable Validation
 *
 * This module provides type-safe client environment variable validation using Zod.
 * Only NEXT_PUBLIC_* variables that are intentionally exposed to the browser.
 *
 * **IMPORTANT**: This file is safe to import from client-side code.
 * For server-only variables, use `@/lib/env` (which imports from ./server).
 *
 * **Usage**:
 * ```typescript
 * import { clientEnv } from '@/lib/env/client'
 *
 * const logLevel = clientEnv.NEXT_PUBLIC_LOG_LEVEL
 * ```
 */
import { z } from 'zod'

/**
 * Client-side environment variables schema
 *
 * These variables are intentionally exposed to the client via NEXT_PUBLIC_ prefix:
 * - Error tracking configuration
 * - Client-side logging levels
 */
export const ClientEnvSchema = z.object({
  /**
   * Sentry DSN for error tracking (both server and client)
   * NEXT_PUBLIC_ prefix makes it accessible on both server and client
   */
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),

  /**
   * Log level for both client and server-side logging
   * Controls Payload's Pino logger and client-side console output
   * NEXT_PUBLIC_ prefix makes it accessible on both server and client
   *
   * @default 'silent' (client), varies by NODE_ENV (server)
   */
  NEXT_PUBLIC_LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).optional(),

  /**
   * Public Mapbox access token, used by the address-autocomplete field
   * (`AddressSearchField`) to call the Mapbox Search Box API from the browser.
   * When unset, the address field degrades to plain manual entry.
   */
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: z.string().optional(),
})

// Type inference for TypeScript
export type ClientEnv = z.infer<typeof ClientEnvSchema>

/**
 * Validated client-side environment variables
 *
 * Throws validation error on module import if environment is invalid.
 * Provides type-safe access to all client-accessible environment variables.
 */
export const clientEnv = (() => {
  try {
    return ClientEnvSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Note: Using console.error here is intentional for fail-fast behavior
      // This code runs at module load time, before any logging system is available
      // eslint-disable-next-line no-console
      console.error('❌ Environment validation error (client):')
      // eslint-disable-next-line no-console
      console.error(error.issues)
      // eslint-disable-next-line no-console
      console.error('\nCheck your .env file and compare with .env.example for required variables.')
      throw new Error(
        'Invalid client environment variables. Check the error details above and verify your .env file matches .env.example requirements.',
      )
    }
    throw error
  }
})()
