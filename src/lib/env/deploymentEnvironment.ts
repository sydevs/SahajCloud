/**
 * Which deployment this process is — the name error reporting tags events with.
 *
 * Deliberately NOT exported from `@/lib/env`'s barrel: that barrel pulls in the
 * validated `serverEnv` parse, and both Sentry call sites below run during
 * Next.js `instrumentation.register()`, before that parse is safe to depend on.
 * Read `process.env` directly and import this module by its deep path.
 */

/**
 * The current Railway environment name, or `undefined` off-Railway (local, CI,
 * test). Prefers `RAILWAY_ENVIRONMENT_NAME`, falling back to the legacy
 * `RAILWAY_ENVIRONMENT` (`scripts/postinstall.cjs` confirms the latter is set on
 * Railway). Production is `production`; PR previews are `pr-<number>` (see
 * RAILWAY_RUNBOOK.md). Both vars are present at build + runtime.
 */
export const railwayEnvironmentName = (): string | undefined =>
  process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT

/**
 * The name to tag error reports with.
 *
 * ⚠ **`NODE_ENV` alone cannot tell a PR preview from production** — Railway
 * builds a preview with `NODE_ENV=production`, so every preview error used to
 * land in the production Sentry project tagged `environment: production`, and a
 * test-generated preview 500 read as a live production regression (#733).
 *
 * So the Railway environment name wins where there is one: `production` on
 * production, `pr-<number>` on a preview. Off-Railway there is no name, and
 * `NODE_ENV` is the honest answer — that is what keeps a local run reporting
 * `development`.
 *
 * ⚠ **`undefined` is not a neutral answer to Sentry.** `DEFAULT_ENVIRONMENT`
 * in `@sentry/core` is the literal string `production`, and `prepareEvent`
 * applies it (`event.environment || environment || DEFAULT_ENVIRONMENT`), so
 * returning `undefined` would tag the event with the exact value #733 is
 * about. Next always sets `NODE_ENV`, so that branch is unreachable in this
 * app — it is typed `string | undefined` because the environment does not
 * guarantee otherwise, not because a missing name is safe.
 */
export const deploymentEnvironment = (): string | undefined =>
  railwayEnvironmentName() ?? process.env.NODE_ENV
