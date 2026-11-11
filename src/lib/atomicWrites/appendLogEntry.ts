import type { CollectionSlug, Payload, PayloadRequest } from 'payload'

import { randomUUID } from 'crypto'

import { sql } from '@payloadcms/db-postgres/drizzle'
import { hasDraftsEnabled } from 'payload/shared'

import { DEFAULT_LOG_LIMIT, type LogEntry, toLogRow } from '@/fields'
import { quotedDbSchema } from '@/plugins/usage'

/**
 * Add one entry to a document's `activityLog`.
 *
 * Every writer of this column used to rebuild the whole array from a copy it
 * had read — so two writers working at once kept only the later one's entries,
 * and a dropped reminder entry is what let the next run send the reminder
 * again. An entry is its own row now, so an append adds one and reads none:
 * concurrent writers cannot overwrite each other. The trim to
 * {@link DEFAULT_LOG_LIMIT} follows it, or the table would grow without bound.
 *
 * ⚠ **On the caller's own connection, never the pool.** Two callers are
 * `afterChange` hooks whose transaction has already written the row they are
 * logging on: a second connection would wait on that row lock, and the
 * transaction holding it is waiting on this call. `POST /api/clients/report`
 * documents the opposite trade — it is deliberately outside any transaction,
 * because its contended reader is another request.
 *
 * ⚠ **A collection carrying drafts needs the `latest: true` version row too.**
 * Payload serves a `draft: true` read from that row whenever one exists, with
 * no comparison against the main row — so the main row alone leaves the entry
 * invisible to the admin edit view, which is the log table's only reader. Worse,
 * `updateByID` loads the document it is about to write from the same row and
 * writes the merged whole back, so the next ordinary save of the document would
 * delete every entry appended since.
 *
 * It writes no version *history* and runs no hook, which is what the column
 * wants: nothing reads an activity log back as state, and the entry is built
 * here rather than taken from a caller's input.
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

  // Payload names an array's table after the parent table and the field, both
  // in snake case, and `logField`'s default field name gives the second half.
  // A document with a second log would have to say which one — no collection
  // has one.
  const schema = quotedDbSchema(payload)
  const base = collection.replace(/-/g, '_')
  const executor = await session(payload, req)

  await insert(executor, `${schema}."${base}_activity_log"`, id, entry, 'id', randomUUID())

  if (!hasDraftsEnabled(payload.collections[collection]?.config)) return

  // The version row a `draft: true` read is served from. Its own `_uuid` holds
  // what the main table holds in `id`: Payload gives the versions table a
  // serial id of its own, because one array row can be versioned many times.
  const versions = await executor.execute(sql`
    SELECT id FROM ${sql.raw(`${schema}."_${base}_v"`)}
    WHERE parent_id = ${id} AND latest = true
  `)
  const versionId = firstId(versions)
  if (versionId === undefined) return

  await insert(
    executor,
    `${schema}."_${base}_v_version_activity_log"`,
    versionId,
    entry,
    '_uuid',
    randomUUID(),
  )
}

/**
 * One row at the end of a parent's log, then the oldest trimmed off.
 *
 * `_order` is read and written in the same statement, so a concurrent append
 * can land on the same number. That is a tie in the stored order and nothing
 * else — no entry is lost, and the table is read back sorted on `at`.
 */
async function insert(
  executor: Executor,
  table: string,
  parentId: number,
  entry: LogEntry,
  idColumn: 'id' | '_uuid',
  rowId: string,
): Promise<void> {
  const row = toLogRow(entry)
  const target = sql.raw(table)
  await executor.execute(sql`
    INSERT INTO ${target} (_order, _parent_id, ${sql.raw(`"${idColumn}"`)}, "at", "type", "key", "cells", "data")
    SELECT coalesce(max(_order), 0) + 1, ${parentId}, ${rowId},
           ${row.at ?? null}, ${row.type ?? null}, ${row.key ?? null},
           ${json(row.cells)}::jsonb, ${json(row.data)}::jsonb
    FROM ${target} WHERE _parent_id = ${parentId}
  `)
  await executor.execute(sql`
    DELETE FROM ${target} WHERE _parent_id = ${parentId} AND id IN (
      SELECT id FROM ${target} WHERE _parent_id = ${parentId}
      ORDER BY _order DESC OFFSET ${DEFAULT_LOG_LIMIT}
    )
  `)
}

/** A json column's parameter: the value as text, or SQL NULL. */
function json(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value)
}

/** The `id` of the first row a select returned, whatever shape the driver used. */
function firstId(result: unknown): number | undefined {
  const rows = Array.isArray(result)
    ? result
    : ((result as { rows?: unknown[] } | null)?.rows ?? [])
  const first = rows[0] as { id?: unknown } | undefined
  return typeof first?.id === 'number' ? first.id : undefined
}

/** One statement's worth of Drizzle. */
interface Executor {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>
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
