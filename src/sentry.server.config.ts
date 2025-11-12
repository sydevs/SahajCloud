// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  enabled: process.env.NODE_ENV === 'production',

  dsn: process.env.SENTRY_DSN,

  // Environment tag for filtering events in Sentry dashboard
  environment: process.env.NODE_ENV || 'development',

  // Extra safeguard: Don't send events from development or test environments
  beforeSend(event, hint) {
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
