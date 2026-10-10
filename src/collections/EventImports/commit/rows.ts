/**
 * Which rows a commit still owes, and the provenance entry each one leaves
 * behind.
 *
 * ⚠ **`committed` is what makes a commit resumable, and the only thing that
 * does.** A batch is not written in one transaction, so a job that dies
 * half-way has already created classes — and its retry must not create them
 * again. There is no cursor for a caller to get wrong: what is owed is whatever
 * is still committable and unwritten.
 */

import type { LogEntry } from '@/fields'
import type { EventImportRows } from '@/payload-types'

export type CommitRow = EventImportRows[number]

/** The log `type` every imported class carries, so a sweep can find them. */
export const IMPORT_LOG_TYPE = 'event-import'

/** What the reviewer chose for a duplicate row, `skip` until they chose. */
export function duplicateAction(row: CommitRow): 'import' | 'skip' {
  return row.duplicate?.action ?? 'skip'
}

/**
 * Every reason a row created nothing, in the words the volunteer will read.
 *
 * ⚠ **One spelling, because the review table and the report are read minutes
 * apart by the same person.** The review's Notes column, the skipped-lines CSV
 * and the summary email all come through here, so a second spelling anywhere
 * would read as the commit having found a different fault from the one they
 * approved skipping.
 *
 * `extra` is for a refusal that is not on the row yet: the proposal's own
 * `rowErrors`, which the commit folds on with `adoptTreeErrors` before it reads
 * any of this, and which the review has to fold on itself.
 *
 * ⚠ **Here rather than in `commit/summary.ts`, which is where it was written.**
 * `RowsTable` is a `'use client'` component, and `summary.ts` reaches
 * `@/lib/utilities/validationFailure`, which value-imports `ValidationError`
 * from `payload` — pulling the server package into an admin chunk is the
 * deploy-only failure `src/AGENTS.md` records. This module imports types only.
 */
export function skipReasons(row: CommitRow, extra: readonly string[] = []): string[] {
  return [...(row.errors ?? []), ...extra, ...duplicateReason(row)]
}

/**
 * What this row repeats, in the words both the review and the report use.
 *
 * ⚠ **Not named `duplicateReason`, which `resolve/duplicates.ts` already
 * exports for the reason *enum*** — a second exported one under that name makes
 * a grep for either return both. And unlike the refusal below it answers
 * whatever the reviewer chose: the review table has to say what matched while
 * they are still deciding, and after they choose `import` it is no longer a
 * reason the row is skipped.
 */
export function duplicateMatchNote(row: CommitRow): null | string {
  if (!row.duplicate) return null
  const { atCommit, line, eventId, strength } = row.duplicate
  if (line !== undefined) return `a repeat of line ${line}`
  const what = eventId !== undefined ? `class #${eventId}` : 'an existing class'
  if (atCommit) return `a repeat of ${what}, added after you reviewed this batch`
  return strength === 'weak' ? `possibly a repeat of ${what}` : `a repeat of ${what}`
}

/**
 * Why a matched row was left alone.
 *
 * A duplicate carries no `errors` — it is not a fault, and nothing about the
 * class it repeats is modified (`resolve/duplicates.ts`).
 */
function duplicateReason(row: CommitRow): string[] {
  if (row.committed || duplicateAction(row) !== 'skip') return []
  const note = duplicateMatchNote(row)
  return note ? [note] : []
}

/**
 * Whether the row is one the commit may write at all.
 *
 * ⚠ **A duplicate is committable only once the reviewer chose to import it
 * alongside the class it repeats.** Skipping is the default, so no second
 * listing is published because nobody looked — and there is no third choice: an
 * import never modifies an existing class.
 */
export function isCommittable(row: CommitRow): boolean {
  return !!row.resolved && !row.errors?.length && (!row.duplicate || duplicateAction(row) === 'import')
}

/**
 * The class's exactly-once key: the batch and the line.
 *
 * ⚠ **Stored on the class, unique, and checked before every create.**
 * `committed` reaches the batch only when the rows are written back, so a job
 * that dies after creating a class — or whose final write fails — leaves a row
 * that looks unwritten. Without this the retry created it again.
 */
export function importKeyFor(batchId: number, line: number): string {
  return `${batchId}:${line}`
}

/**
 * Give a skipped repeat back its chance when the line it repeats was never
 * imported.
 *
 * A file's second copy of a class is skipped in favour of its first. If the
 * first then fails at commit, skipping the second as well would import neither.
 */
export function reviveOrphanedRepeats(rows: CommitRow[]): void {
  const failed = new Set(
    rows.filter((row) => row.errors?.length && !row.committed).map((row) => row.line),
  )
  for (const row of rows) {
    const repeated = row.duplicate?.line
    if (repeated !== undefined && failed.has(repeated) && duplicateAction(row) === 'skip') {
      delete row.duplicate
    }
  }
}

/** Rows still owed a class. */
export function rowsAwaitingCommit(rows: readonly CommitRow[]): CommitRow[] {
  return rows.filter((row) => isCommittable(row) && !row.committed)
}

/** Record why a row will not be committed, so a later pass skips it. */
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
  uploader: Uploader
  at: string
}): LogEntry {
  const { batchId, line, uploader, at } = args
  return {
    at,
    type: IMPORT_LOG_TYPE,
    key: importKeyFor(batchId, line),
    // ⚠ **The id travels beside the name.** `name` is the account holder's to
    // edit, and the batch that named the uploader is gone once the commit
    // finishes — so a name alone could credit anybody.
    uploaderId: uploader.id,
    cells: {
      activity: 'Imported',
      who: uploader.id === null ? uploader.name : `${uploader.name} (#${uploader.id})`,
      delivery: `Bulk import, CSV line ${line}`,
    },
  }
}

/** Who uploaded a batch, which is not always who fires its commit. */
export interface Uploader {
  id: null | number
  name: string
}
