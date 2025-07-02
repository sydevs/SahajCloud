import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Set tracesSampleRate to 1.0 to capture 100%
  // of the transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Capture 100% of the transactions for debugging, but be sure
  // to reduce this in production to avoid consuming too many resources
  debug: false, // process.env.NODE_ENV === 'development',
  
  // Note: Replay integration can be added later if needed
  // replaysOnErrorSampleRate: 1.0,
  // replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.1,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
