/**
 * Server-side Sentry initialization (@sentry/nextjs, Node runtime).
 *
 * Loaded by `src/instrumentation.ts` on server startup. Captures errors from the
 * Node server (Payload operations, API routes, scheduled jobs). Client errors
 * initialize separately in `src/instrumentation-client.ts`.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

/**
 * Performance-tracing sample rate. Read straight from `process.env` (with a
 * clamp + fallback) rather than the validated `serverEnv` so Sentry can init
 * during Next.js `instrumentation.register()` without depending on the full
 * server-env parse — mirrors the direct DSN read above. Documented + validated
 * for other consumers as `SENTRY_TRACES_SAMPLE_RATE` in `@/lib/env/server`.
 */
const DEFAULT_TRACES_SAMPLE_RATE = 0.1
const parsedRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
const tracesSampleRate = Number.isFinite(parsedRate)
  ? Math.min(Math.max(parsedRate, 0), 1)
  : DEFAULT_TRACES_SAMPLE_RATE

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Never attach PII to events/spans. Explicit even though it's the
    // @sentry/nextjs default — now that tracing is on, this keeps the
    // @sentry/node HTTP integration from recording request headers (Cookie,
    // Authorization) and keeps pg spans to parameterized SQL (no bound param
    // values). Pins the privacy posture as tracing scales. See issue #529.
    sendDefaultPii: false,
    // Low-rate performance tracing (default 0.1). The @sentry/node HTTP + `pg`
    // auto-instrumentation turns each admin request — bulk edits and the
    // `/api/{collection}` reads the list/edit views fire — into a transaction
    // with a DB-span breakdown, without any manual spans. Set
    // SENTRY_TRACES_SAMPLE_RATE=0 to disable.
    tracesSampleRate,
  })
}
