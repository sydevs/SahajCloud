/**
 * Which rows a commit still owes, and the provenance entry each one leaves
 * behind.
 *
 * ⚠ **`committed` is what makes a commit resumable, and the only thing that
 * does.** A batch is not written in one transaction (#828), so a request that
 * dies half-way has already created classes — and the next one must not create
 * them again. There is no cursor for a caller to get wrong: the next chunk is
 * whatever is still committable and unwritten.
 */

import type { LogEntry } from '@/fields'
import type { EventImportRows } from '@/payload-types'

export type CommitRow = EventImportRows[number]

/** The log `type` every imported class carries, so a sweep can find them. */
export const IMPORT_LOG_TYPE = 'event-import'

/**
 * Whether the row is one the commit may write at all.
 *
 * The same three questions the propose step asks (`endpoints/propose.ts`), in
 * the same order, because a row counted towards the tree and then skipped here
 * would leave a region holding nothing.
 */
export function isCommittable(row: CommitRow): boolean {
  return !!row.resolved && !row.errors?.length && !row.duplicate
}

/** Rows still owed a class. */
export function rowsAwaitingCommit(rows: readonly CommitRow[]): CommitRow[] {
  return rows.filter((row) => isCommittable(row) && !row.committed)
}

/** Record why a row will not be committed, so the next chunk skips it. */
export function refuseRow(row: CommitRow, ...errors: string[]): void {
  row.errors = [...(row.errors ?? []), ...errors]
}

/**
 * The entry naming who imported a class and from which line.
 *
 * ⚠ **Appended after the create, never written with it.** For an adopted class
 * `syncVerificationOnSave` replaces `activityLog` wholesale with its own
 * verification entry, so an entry passed to the create survives on an unadopted
 * class and silently vanishes on an adopted one. One path for both, at the cost
 * of a second write per row.
 *
 * `key` is the batch and the line — the exactly-once key `logField` asks every
 * writer for, scoped per batch so two batches importing the same line number are
 * two entries rather than one.
 */
export function importLogEntry(args: {
  batchId: number
  line: number
  uploaderName: string
  at: string
}): LogEntry {
  const { batchId, line, uploaderName, at } = args
  return {
    at,
    type: IMPORT_LOG_TYPE,
    key: `${batchId}:${line}`,
    cells: {
      activity: 'Imported',
      who: uploaderName,
      delivery: `Bulk import, CSV line ${line}`,
    },
  }
}
