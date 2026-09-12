/**
 * The `NEXT_PUBLIC_*` variables — a **schema**, not an accessor.
 *
 * `ServerEnvSchema` extends this one, so the server validates these four
 * alongside its own secrets and reads them as `serverEnv.NEXT_PUBLIC_*`.
 *
 * ⚠ **There is deliberately no `clientEnv` value here.** There used to be, as
 * `ClientEnvSchema.parse(process.env)`, and in a browser it parsed an empty
 * object: Next substitutes **literal `process.env.<KEY>` member expressions**
 * and nothing else, so a bare `process.env` is the empty stub from
 * `next/dist/compiled/process`. Every key read through it was `undefined` in
 * the browser, which is why `Sentry.init` never ran there at all (#760).
 *
 * **Browser code reads a literal member expression instead** — as
 * `src/lib/contact/index.ts`, `src/lib/mapbox/geocoder.ts` and
 * `AddressSearchField.tsx` already do:
 *
 * ```typescript
 * const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
 * ```
 *
 * Re-exporting a parsed object from here would only re-arm the same trap: the
 * enumeration it would have to parse can drift from this schema silently, and
 * the drift looks like working config.
 */
import { z } from 'zod'

/**
 * The log levels `NEXT_PUBLIC_LOG_LEVEL` accepts, in order of verbosity.
 *
 * The schema below is built from this list, and `clientLogger` narrows its
 * literal `process.env.NEXT_PUBLIC_LOG_LEVEL` read against it — so the browser
 * gets the vocabulary without pulling zod in, and the two cannot drift.
 */
export const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]

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
