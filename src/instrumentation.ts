// Instrumentation file for Next.js
// Uses @sentry/cloudflare for Cloudflare Workers compatibility with OpenNext
// See: https://docs.sentry.io/platforms/javascript/guides/cloudflare/

export async function register() {
  // Only enable Sentry instrumentation in production for Cloudflare Workers edge runtime
  if (process.env.NODE_ENV !== 'production') {
    return
  }

  // Initialize Sentry for Cloudflare Workers edge runtime
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export async function onRequestError(err: unknown) {
  // Import Sentry dynamically to capture exceptions
  const Sentry = await import('@sentry/cloudflare')
  Sentry.captureException(err)
}
