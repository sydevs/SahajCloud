// Instrumentation file for Next.js with Sentry integration
// Uses @sentry/cloudflare for Cloudflare Workers compatibility with OpenNext
// See: https://docs.sentry.io/platforms/javascript/guides/cloudflare/
//
// Note: For Next.js edge runtime on Cloudflare Workers, Sentry initialization
// is handled differently than standard Cloudflare Workers. The @sentry/cloudflare
// package's functions work without explicit initialization in the edge runtime.
// Errors are captured via captureException() calls in onRequestError and throughout
// the application.

import * as Sentry from '@sentry/cloudflare'

export async function register() {
  // Server-side Sentry initialization for edge runtime
  // Note: @sentry/cloudflare functions work without explicit init() in Next.js edge runtime
  // Configuration is handled per-request via environment variables
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_RUNTIME === 'edge') {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

    if (!dsn) {
      // eslint-disable-next-line no-console
      console.warn('NEXT_PUBLIC_SENTRY_DSN not configured - Sentry error tracking disabled')
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
