/**
 * Client-side Sentry re-export
 *
 * Sentry is initialized in src/instrumentation-client.ts which Next.js
 * automatically executes when the browser loads the application.
 *
 * This module re-exports Sentry for use in client components.
 * Server-side errors are handled by the Sentry plugin in payload.config.ts.
 */
export * from '@sentry/react'
