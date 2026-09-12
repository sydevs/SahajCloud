/**
 * Client-side instrumentation for Sentry (@sentry/nextjs)
 *
 * This file is automatically executed by Next.js when a new browser instance
 * loads the application. It initializes Sentry for client-side error tracking.
 * Server-side errors initialize in src/sentry.server.config.ts via
 * src/instrumentation.ts.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import * as Sentry from '@sentry/nextjs'

import { clientDeploymentEnvironment } from '@/lib/env/deploymentEnvironment'

// ⚠ A literal member expression — the only form Next substitutes (#760, and
// `src/AGENTS.md`). Never read a NEXT_PUBLIC_* value any other way.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// ⚠ `.env` is git-tracked and carries the real DSN, so the read alone would
// start sending every developer's local browser errors to the live project.
// Reporting is a deployment's job, and a Railway deploy builds with
// NODE_ENV=production (#733). A local production build still reports — the
// deployment name now reaches the browser, so gating on it too is possible,
// but it is a reporting decision rather than #737's tagging fix.
const isProduction = process.env.NODE_ENV === 'production'

// This is the ONE browser `Sentry.init` in the app. `ErrorBoundary`,
// `global-error.tsx` and `clientLogger` capture through the client it installs
// rather than each initializing their own: a second `init` replaces the first
// on the current scope, taking the router instrumentation below with it.
if (dsn && isProduction) {
  Sentry.init({
    dsn,
    environment: clientDeploymentEnvironment(),
    // Disable performance tracing, only capture errors
    tracesSampleRate: 0,
  })
} else if (!isProduction) {
  // eslint-disable-next-line no-console
  console.info('[Sentry] Client-side error tracking disabled outside a deployment')
}

// Instrument App Router navigations (Sentry requires this export from the
// client instrumentation file).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
