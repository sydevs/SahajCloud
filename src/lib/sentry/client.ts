/**
 * Client-side Sentry initialization
 *
 * This module initializes Sentry for client-side error tracking.
 * Server-side errors are handled by the Sentry plugin in payload.config.ts.
 *
 * Import this in the root layout to enable client-side error capture.
 */
import * as Sentry from '@sentry/react'

// Initialize Sentry for client-side errors only
// Server-side errors are handled by the Sentry plugin
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Disable performance tracing, only capture errors
    tracesSampleRate: 0,
  })
}

export { Sentry }
