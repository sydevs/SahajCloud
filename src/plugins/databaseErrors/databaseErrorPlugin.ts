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
 * recognition itself is pure and lives in `@/lib/databaseErrors`; see that
 * module for why the driver error is reached through `cause` and why the
 * database is left to make the judgement. (sydevs/SahajCloud#670)
 *
 * REST only. GraphQL takes its own error path and reads `graphqlResult`, which
 * this hook does not set.
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

          return {
            response: { errors: [{ name: 'BadRequest', message: mapped.message }] },
            status: mapped.status,
          }
        },
      ],
    },
  })
