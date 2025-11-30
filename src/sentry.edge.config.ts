// This file configures the initialization of Sentry for Cloudflare Workers edge runtime.
// Uses @sentry/cloudflare for Cloudflare Workers compatibility with OpenNext.
// https://docs.sentry.io/platforms/javascript/guides/cloudflare/
//
// NOTE: @sentry/cloudflare's `init` function is not exported in the package's public API.
// We use a direct import from the build path as a workaround until Sentry provides
// official Next.js + OpenNext support or exports the init function properly.

// Only load Sentry in production to avoid module resolution errors in development
if (process.env.NODE_ENV === 'production') {
  // Dynamic import to avoid build errors in development
  import('@sentry/cloudflare').then(({ init, beforeSend }) => {
    // @ts-expect-error - Using dynamic import for production-only Sentry initialization
    init({
      enabled: true,

      dsn: process.env.SENTRY_DSN,

      // Environment tag for filtering events in Sentry dashboard
      environment: 'production',

      // Set tracesSampleRate to 0.1 to capture 10% of transactions
      tracesSampleRate: 0.1,

      debug: false,
    })
  }).catch(() => {
    // Silently fail if Sentry import fails
  })
}
