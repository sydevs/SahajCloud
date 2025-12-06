/**
 * Client-side instrumentation for Sentry
 *
 * This file is automatically executed by Next.js when a new browser instance
 * loads the application. It initializes Sentry for client-side error tracking.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import * as Sentry from '@sentry/react'

// Initialize Sentry for client-side errors only
// Server-side errors are handled by the Sentry plugin
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Disable performance tracing, only capture errors
    tracesSampleRate: 0,
  })
} else if (process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line no-console
  console.info('[Sentry] Client-side error tracking disabled (NEXT_PUBLIC_SENTRY_DSN not configured)')
}
