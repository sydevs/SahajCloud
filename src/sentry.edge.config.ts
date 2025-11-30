// This file configures the initialization of Sentry for Cloudflare Workers edge runtime.
// Uses @sentry/cloudflare for Cloudflare Workers compatibility with OpenNext.
// https://docs.sentry.io/platforms/javascript/guides/cloudflare/
//
// NOTE: Sentry initialization is disabled in development to avoid module resolution errors.
// In production, Sentry is initialized via the onRequestError hook in instrumentation.ts.

// Export empty object to satisfy module requirements
// Actual Sentry setup happens in production via instrumentation.ts onRequestError
export const SENTRY_CONFIG = {
  enabled: process.env.NODE_ENV === 'production',
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
}
