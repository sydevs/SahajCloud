import type { Payload } from 'payload'

import { sql } from '@payloadcms/db-postgres'

/** The transaction `drizzle.transaction` hands its callback. */
export type Tx = Parameters<Parameters<Payload['db']['drizzle']['transaction']>[0]>[0]

/**
 * Runs `body` against this suite's own Postgres schema, on one connection — for a
 * migration's `up`, which writes unqualified table names, as production's `public`
 * schema wants.
 *
 * ⚠ This lane gives each suite its own schema, and `execute` draws from a pool, so a
 * bare `SET search_path` would land on whichever connection answered it. One
 * transaction with `SET LOCAL` keeps it to one connection, undone at commit.
 */
export const withSchema = async (
  payload: Payload,
  body: (tx: Tx) => Promise<void>,
): Promise<void> => {
  const schema = payload.db.schemaName
  // Without one, every statement would read `public`, where the suite has no tables,
  // and a migration case would pass having changed nothing.
  if (!schema) throw new Error('the suite has no isolated schema to target')
  await payload.db.drizzle.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL search_path TO ${sql.identifier(schema)}`)
    await body(tx)
  })
}
