/**
 * One request at a time per batch.
 *
 * ⚠ **A conditional UPDATE, because a read-then-write is the race itself.** Two
 * commit calls on one batch — a double click, two tabs, a Resume pressed while a
 * request the proxy cut is still running — each read the same rows and each
 * created every class in the chunk. Payload's own `update({ where })` finds and
 * then writes, so it has the same gap; the claim below is one statement, and
 * Postgres lets exactly one caller see the lease free.
 *
 * ⚠ **A lease, not a lock.** A request that dies holding it does not hold the
 * batch forever: the claim expires after {@link LEASE_MS}, which is far longer
 * than any chunk is allowed to run (`RESOLVE_TIME_BUDGET_MS`, the commit chunk).
 * A request checks it still holds the lease before its final write, so one that
 * overran and lost it writes nothing (`renewLease`).
 */

import type { PostgresAdapter } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

import { randomUUID } from 'node:crypto'

import { and, eq, isNull, lt, or } from '@payloadcms/db-postgres/drizzle'

/** How long a claim lasts before another request may take the batch. */
export const LEASE_MS = 120_000

/** What a refused claim tells the caller, which the UI waits on and retries. */
export const BUSY_MESSAGE =
  'This batch is busy with another request. Wait a moment and it will carry on.'

function leaseTable(req: PayloadRequest) {
  const db = req.payload.db as unknown as PostgresAdapter
  return { db, table: db.tables.event_imports! }
}

/** The lease token, or null when another request holds the batch. */
export async function claimLease(req: PayloadRequest, id: number): Promise<null | string> {
  const { db, table } = leaseTable(req)
  const token = randomUUID()
  const now = new Date()
  const claimed = await db.drizzle
    .update(table)
    .set({ leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString() })
    .where(
      and(
        eq(table.id, id),
        or(isNull(table.leaseUntil), lt(table.leaseUntil, now.toISOString())),
      ),
    )
    .returning({ id: table.id })
  return claimed.length ? token : null
}

/**
 * Extend the lease, and say whether this request still holds it.
 *
 * Called right before a request's final write: false means it overran its lease
 * and somebody else may be working the batch, so it must write nothing.
 */
export async function renewLease(req: PayloadRequest, id: number, token: string): Promise<boolean> {
  const { db, table } = leaseTable(req)
  const renewed = await db.drizzle
    .update(table)
    .set({ leaseUntil: new Date(Date.now() + LEASE_MS).toISOString() })
    .where(and(eq(table.id, id), eq(table.leaseToken, token)))
    .returning({ id: table.id })
  return renewed.length > 0
}

/** Give the batch back. A lease already lost or expired is left alone. */
export async function releaseLease(req: PayloadRequest, id: number, token: string): Promise<void> {
  const { db, table } = leaseTable(req)
  await db.drizzle
    .update(table)
    .set({ leaseToken: null, leaseUntil: null })
    .where(and(eq(table.id, id), eq(table.leaseToken, token)))
}

/**
 * Run `work` holding the batch's lease, or answer 409 when another request
 * holds it. The lease is released however `work` ends.
 */
export async function withLease(
  req: PayloadRequest,
  id: number,
  work: (token: string) => Promise<Response>,
): Promise<Response> {
  const token = await claimLease(req, id)
  if (!token) return busy()
  try {
    return await work(token)
  } finally {
    await releaseLease(req, id, token).catch((error: unknown) =>
      req.payload.logger.warn({ err: error, batch: id }, 'Event import lease not released'),
    )
  }
}

/**
 * The 409 for a batch another request holds, or one this request lost before
 * its final write. `busy` is what the UI waits on rather than reports.
 */
export function busy(): Response {
  return Response.json({ busy: true, errors: [{ message: BUSY_MESSAGE }] }, { status: 409 })
}
