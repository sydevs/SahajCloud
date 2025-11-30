// This file configures the initialization of Sentry for Cloudflare Workers edge runtime.
// Uses @sentry/cloudflare for Cloudflare Workers compatibility with OpenNext.
// https://docs.sentry.io/platforms/javascript/guides/cloudflare/
//
// NOTE: @sentry/cloudflare's `init` function is not exported in the package's public API.
// We use a direct import from the build path as a workaround until Sentry provides
// official Next.js + OpenNext support or exports the init function properly.

import type { Event, EventHint } from '@sentry/cloudflare'

// @ts-expect-error - init is not exported in package.json but exists in sdk module
import { init } from '@sentry/cloudflare/build/esm/sdk.js'

init({
  enabled: process.env.NODE_ENV === 'production',

  dsn: process.env.SENTRY_DSN,

  // Environment tag for filtering events in Sentry dashboard
  environment: process.env.NODE_ENV || 'development',

  // Extra safeguard: Don't send events from development or test environments
  beforeSend(event: Event, _hint: EventHint) {
    if (process.env.NODE_ENV !== 'production') {
      return null
    }
    return event
  },

  // Set tracesSampleRate to 1.0 to capture 100%
  // of the transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  debug: false,
})
