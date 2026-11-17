/**
 * Postgres Wake — on a Railway PR preview, the database adapter retries a
 * connection while a sleeping Postgres wakes. See `retryWhilePostgresWakes`.
 */
import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { DatabaseAdapterObj } from 'payload'

import { railwayEnvironmentName } from '@/lib/env/deploymentEnvironment'
import { isPreviewEnvironmentName } from '@/lib/preview/proxy'

import { withWakeRetry } from './wakeRetry'

/**
 * `adapter`, retrying each connection while a PR preview's Postgres wakes
 * (`wakeRetry.ts` holds the budget), and untouched anywhere else.
 *
 * ⚠ A preview's Postgres sleeps when idle (DEPLOYMENT.md → Cost Monitoring),
 * and the connection that wakes it is refused. Unretried, that fails the
 * request — and `request-magic-link` answers every failure as a 200 with no
 * token, which is how it broke CI's fixture fill. Production never sleeps.
 *
 * The retry wraps the adapter's own `pg` rather than passing ours through the
 * `pg` option, so a preview runs the driver version production does.
 */
export const retryWhilePostgresWakes = (
  adapter: DatabaseAdapterObj<PostgresAdapter>,
): DatabaseAdapterObj<PostgresAdapter> => {
  if (!isPreviewEnvironmentName(railwayEnvironmentName())) return adapter
  return {
    ...adapter,
    init: (args) => {
      const db = adapter.init(args)
      db.pg = withWakeRetry(db.pg, {
        onWaking: (err) =>
          args.payload.logger.info(
            { err },
            'Postgres refused a connection; retrying while it wakes',
          ),
      })
      return db
    },
  }
}
