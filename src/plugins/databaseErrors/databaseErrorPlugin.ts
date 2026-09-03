/**
 * Answer a Postgres cast failure with a 400 instead of a 500.
 *
 * Payload's root `afterError` hook is documented to transform the result object
 * and the status code, and `payload/dist/utilities/routeError.js` does exactly
 * that with what a hook returns:
 *
 * ```js
 * if (result) {
 *   response = result.response || response
 *   status = result.status || status
 * }
 * // …
 * return Response.json(response, { headers, status })
 * ```
 *
 * So the response is rebuilt here rather than the query pre-validated. The
 * recognition itself is pure and lives in `@/lib/databaseErrors`; the reasoning is
 * in `docs/architecture.md`. (sydevs/SahajCloud#670)
 *
 * ⚠ **Payload's own REST routes only.** `routeError` is what invokes root `afterError`
 * hooks, so a custom endpoint that catches its own errors never reaches this — it has to
 * call `mapPostgresCastError` itself, as `Events/endpoints/geojson.ts` does. GraphQL
 * likewise takes its own path and reads `graphqlResult`, which this hook does not set.
 */
import type { Config } from 'payload'

import { INVALID_TEXT_REPRESENTATION, mapPostgresCastError } from '@/lib/databaseErrors'

/**
 * Map database errors that are the caller's mistake onto client errors.
 *
 * @example
 * ```typescript
 * import { databaseErrorPlugin } from '@/plugins/databaseErrors'
 *
 * plugins: [
 *   databaseErrorPlugin(),
 * ]
 * ```
 */
export const databaseErrorPlugin =
  () =>
  (config: Config): Config => ({
    ...config,
    hooks: {
      ...config.hooks,
      afterError: [
        ...(config.hooks?.afterError ?? []),
        ({ error, req }) => {
          const mapped = mapPostgresCastError(error)
          if (!mapped) return

          // The caller gets the 400; this names the rejection in the
          // application logs, so it stays diagnosable without Sentry.
          //
          // ⚠ **Additive, not a downgrade.** `routeError` calls `logError` at
          // ERROR with the full stack *before* any `afterError` hook runs, and
          // `loggingLevels` cannot reach this one — it keys on `err.name`, and
          // `DrizzleQueryError` never sets one, so it is plain `Error`. Every
          // rejected request therefore emits two lines, one of them still at
          // ERROR. Anything alerting on ERROR level still fires; only Sentry
          // stops. Say so rather than implying the noise is gone.
          req.payload.logger.warn({
            msg: 'Rejected a request Postgres could not cast',
            clientId: req.user?.id,
            detail: mapped.message,
            sqlstate: INVALID_TEXT_REPRESENTATION,
            url: req.url,
          })

          // `{ errors: [{ message, code }] }` is the shape every other error in this API
          // uses, and both keys are in the published `ErrorResponse` schema
          // (`@/plugins/openapi/customEndpoints`). The SQLSTATE is the machine-readable
          // half, so a client can branch on the cause without parsing Postgres prose.
          return {
            response: {
              errors: [{ code: INVALID_TEXT_REPRESENTATION, message: mapped.message }],
            },
            status: mapped.status,
          }
        },
      ],
    },
  })
