import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import pg from 'pg'

import { DEFAULT_LOG_LIMIT, type LogEntry } from '@/fields'
import { quotedDbSchema } from '@/plugins/usage'

/**
 * Add one entry to a document's `activityLog`, in a single statement.
 *
 * Every writer of this column used to rebuild the whole array from a copy it
 * had read — so two writers working at once kept only the later one's entries,
 * and a dropped reminder entry is what let the next run send the reminder
 * again. `jsonb ||` merges server-side instead, against whatever the column
 * holds at the moment of the write, so concurrent writers keep each other's
 * entries. The trim to {@link DEFAULT_LOG_LIMIT} rides in the same statement,
 * or the merge would grow the column without bound.
 *
 * ⚠ **On the caller's own connection, never the pool.** Two callers are
 * `afterChange` hooks whose transaction has already written the row they are
 * logging on: a second connection would wait on that row lock, and the
 * transaction holding it is waiting on this call. `POST /api/clients/report`
 * documents the opposite trade — it is deliberately outside any transaction,
 * because its contended reader is another request.
 *
 * ⚠ **That connection takes SQL text and no parameters**, so the entry is
 * escaped with pg's own `escapeLiteral` and the id is checked to be a whole
 * number. Binding them would mean the pool, which the paragraph above rules
 * out. `persistVerification` is on the pool and binds its values.
 *
 * It writes no version row and runs no hook, which is what the column wants:
 * nothing reads an activity log back as state, and the entry is built here
 * rather than taken from a caller's input.
 */
export async function appendLogEntry(args: {
  payload: Payload
  collection: CollectionSlug
  id: number
  entry: LogEntry
  /** The request whose transaction the write must join, where there is one. */
  req?: PayloadRequest
}): Promise<void> {
  const { payload, collection, id, entry, req } = args
  if (!Number.isInteger(id)) throw new Error(`appendLogEntry: ${collection} id ${id} is not a row`)

  // Payload names a table after its slug in snake case, and `logField`'s
  // default field name gives the column. A document with a second log would
  // have to say which one — no collection has one.
  const table = `${quotedDbSchema(payload)}.${pg.escapeIdentifier(collection.replace(/-/g, '_'))}`
  const log = pg.escapeIdentifier('activity_log')
  const updatedAt = pg.escapeIdentifier('updated_at')
  // A column holding anything but an array would make `jsonb_array_elements`
  // throw, which `asLog` tolerates on the read side by dropping it.
  const merged =
    `CASE WHEN jsonb_typeof(${log}) = 'array' THEN ${log} ELSE '[]'::jsonb END` +
    ` || ${pg.escapeLiteral(JSON.stringify([entry]))}::jsonb`

  const executor = await session(payload, req)
  await executor.execute(`
    UPDATE ${table}
    SET ${log} = (
          SELECT coalesce(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
          FROM (SELECT ${merged}) AS merged(entries),
               jsonb_array_elements(merged.entries) WITH ORDINALITY
          WHERE ordinality > jsonb_array_length(merged.entries) - ${DEFAULT_LOG_LIMIT}
        ),
        ${updatedAt} = now()
    WHERE id = ${id}
  `)
}

/** One statement's worth of Drizzle. */
interface Executor {
  execute: (query: string) => Promise<unknown>
}

/**
 * The request's own transaction, or the adapter's connection where it has none.
 *
 * `src/plugins/usage/db.ts` holds the same narrow cast for the pool, and owns
 * the reasoning for casting at all; this is the transaction-aware twin it has
 * no caller for.
 *
 * A request naming a transaction the adapter no longer holds falls back to the
 * plain connection, as Payload's own `getTransaction` does: a session is gone
 * once it has committed or rolled back, so there is no row lock left for the
 * fallback to wait on.
 */
async function session(payload: Payload, req: PayloadRequest | undefined): Promise<Executor> {
  const adapter = payload.db as unknown as {
    drizzle: Executor
    sessions: Record<string, { db: Executor }>
  }
  const transactionId = req?.transactionID === undefined ? undefined : await req.transactionID
  if (transactionId === undefined) return adapter.drizzle
  return adapter.sessions[String(transactionId)]?.db ?? adapter.drizzle
}
