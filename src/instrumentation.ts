import * as Sentry from '@sentry/nextjs'

export async function register() {
  // Only enable Sentry instrumentation in production for edge runtime (Cloudflare Workers)
  if (process.env.NODE_ENV !== 'production') {
    return
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
