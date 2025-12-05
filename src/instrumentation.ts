// Instrumentation file for Next.js with Sentry integration
// Uses @sentry/cloudflare for Cloudflare Workers compatibility with OpenNext
// See: https://docs.sentry.io/platforms/javascript/guides/cloudflare/
//
// IMPORTANT: @sentry/cloudflare does NOT require explicit init() call in Next.js edge runtime.
// The DSN is automatically read from NEXT_PUBLIC_SENTRY_DSN environment variable.
// Errors are captured via Sentry.captureException() calls throughout the application.

import * as Sentry from '@sentry/cloudflare'

export async function register() {
  // Server-side Sentry for edge runtime
  // Configuration is automatic via NEXT_PUBLIC_SENTRY_DSN environment variable
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_RUNTIME === 'edge') {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

    if (!dsn) {
      // eslint-disable-next-line no-console
      console.warn('NEXT_PUBLIC_SENTRY_DSN not configured - Sentry error tracking disabled')
    } else {
      // eslint-disable-next-line no-console
      console.log('Sentry server-side error tracking enabled')
    }
  }
}

export async function onRequestError(err: unknown, request: Request) {
  // Capture exceptions in production edge runtime
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_RUNTIME === 'edge') {
    Sentry.captureException(err, {
      contexts: {
        request: {
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
        },
      },
    })
  }
}
