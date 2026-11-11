import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import pg from 'pg'

import { DEFAULT_LOG_LIMIT, type LogEntry } from '@/fields'

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

  const adapter = payload.db as unknown as DrizzleAdapter
  // `tableNameMap` is keyed by the slug in snake case; every slug here is
  // lowercase and hyphenated, so the two spellings differ only in the
  // separator. The column names come off the built table rather than from the
  // field names, so a `dbName` override still resolves.
  const tableName = adapter.tableNameMap.get(collection.replace(/-/g, '_'))
  const table = tableName === undefined ? undefined : adapter.tables[tableName]
  const log = table?.activityLog?.name
  const updatedAt = table?.updatedAt?.name
  if (tableName === undefined || log === undefined || updatedAt === undefined) {
    throw new Error(`appendLogEntry: ${collection} has no activity log to append to`)
  }

  const quoted = {
    table: `${pg.escapeIdentifier(adapter.schemaName || 'public')}.${pg.escapeIdentifier(tableName)}`,
    log: pg.escapeIdentifier(log),
    updatedAt: pg.escapeIdentifier(updatedAt),
  }
  // A column holding anything but an array would make `jsonb_array_elements`
  // throw, which `asLog` tolerates on the read side by dropping it.
  const merged =
    `(CASE WHEN jsonb_typeof(${quoted.log}) = 'array' THEN ${quoted.log} ELSE '[]'::jsonb END` +
    ` || ${pg.escapeLiteral(JSON.stringify([entry]))}::jsonb)`

  const executor = await session(adapter, req)
  await executor.execute(`
    UPDATE ${quoted.table}
    SET ${quoted.log} = (
          SELECT coalesce(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb)
          FROM jsonb_array_elements(${merged}) WITH ORDINALITY
          WHERE ordinality > jsonb_array_length(${merged}) - ${DEFAULT_LOG_LIMIT}
        ),
        ${quoted.updatedAt} = now()
    WHERE id = ${id}
  `)
}

/** One statement's worth of Drizzle. */
interface Executor {
  execute: (query: string) => Promise<unknown>
}

/**
 * Just enough of the Postgres adapter to run one statement on the right
 * connection. `src/plugins/usage/db.ts` holds the same narrow cast for the pool.
 */
interface DrizzleAdapter {
  drizzle: Executor
  schemaName?: string
  sessions: Record<string, { db: Executor }>
  tables: Record<string, Record<string, { name?: string } | undefined> | undefined>
  tableNameMap: Map<string, string>
}

/** The request's own transaction, or the adapter's connection where it has none. */
async function session(adapter: DrizzleAdapter, req: PayloadRequest | undefined) {
  const transactionId = req?.transactionID === undefined ? undefined : await req.transactionID
  if (transactionId === undefined) return adapter.drizzle
  return adapter.sessions[String(transactionId)]?.db ?? adapter.drizzle
}
