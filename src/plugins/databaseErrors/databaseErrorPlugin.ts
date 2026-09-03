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

          // The caller gets the 400; this is how the same rejection is
          // diagnosable from application logs, without Sentry.
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
