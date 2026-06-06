/**
 * Server-side Sentry initialization (@sentry/nextjs, Node runtime).
 *
 * Loaded by `src/instrumentation.ts` on server startup. Captures errors from the
 * Node server (Payload operations, API routes, scheduled jobs). Client errors
 * initialize separately in `src/instrumentation-client.ts`.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Errors only — no performance tracing (matches the prior configuration).
    tracesSampleRate: 0,
  })
}
