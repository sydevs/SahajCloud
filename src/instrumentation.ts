/**
 * Next.js instrumentation hook.
 *
 * Runs once when the server process starts. Initializes server-side Sentry for
 * the Node runtime and forwards Next.js request errors to Sentry. The app runs
 * on a long-lived Node server (Railway); there is no edge runtime to instrument.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
}

export const onRequestError = Sentry.captureRequestError
