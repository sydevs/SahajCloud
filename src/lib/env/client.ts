/**
 * The `NEXT_PUBLIC_*` variables — a **schema**, not an accessor.
 *
 * `ServerEnvSchema` extends this one, so the server validates these four
 * alongside its own secrets and reads them as `serverEnv.NEXT_PUBLIC_*`.
 *
 * ⚠ **There is deliberately no `clientEnv` value here, and adding one back
 * re-arms #760.** Browser code reads `process.env.NEXT_PUBLIC_<KEY>` as a
 * literal member expression instead. Why, and why not an enumerated
 * `runtimeEnv` object: `src/AGENTS.md`, "A second guard walks the same graph".
 * `tests/unit/public-env-substitution.spec.ts` enforces it.
 */
import { z } from 'zod'

import { LOG_LEVELS } from './logLevels'

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
  NEXT_PUBLIC_LOG_LEVEL: z.enum(LOG_LEVELS).optional(),

  /**
   * Public Mapbox access token, used by the address-autocomplete field
   * (`AddressSearchField`) to call the Mapbox Search Box API from the browser.
   * When unset, the address field degrades to plain manual entry.
   */
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: z.string().optional(),

  /**
   * Public support / contact address shown in mailto links and used as the
   * transactional from/to address. Read everywhere via `CONTACT_EMAIL`
   * (`@/lib/contact`), which falls back to `contact@sydevelopers.com` when
   * unset; this schema entry validates the format when it is set.
   */
  NEXT_PUBLIC_CONTACT_EMAIL: z.email().optional(),
})

// Type inference for TypeScript
export type ClientEnv = z.infer<typeof ClientEnvSchema>
