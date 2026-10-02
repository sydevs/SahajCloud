/**
 * What a commit did, counted from the rows rather than tracked as it went.
 *
 * ⚠ **The rows are the only cumulative record, so every count has to come from
 * them.** A commit is chunked, and `ensureProposedRegions` and
 * `ensureCoordinators` re-establish their work on each call — so the last
 * chunk's own return reports the regions an earlier chunk created as adopted and
 * its coordinators as matched. Recomputing from `rows` gives the batch's total
 * at any point, and the response banner and the summary email cannot disagree
 * about it.
 */

import type { CommitRow } from './rows'

import { managerKeyOf } from './managers'

export interface CommitTally {
  total: number
  committed: number
  /**
   * Classes whose row named a coordinator. `syncVerificationOnSave` adopts one
   * on its create, so it lands `verified` on that coordinator's cadence.
   */
  verified: number
  /** Classes committed with nobody vouching for them: published, and `unverified`. */
  unverified: number
  duplicates: number
  errors: number
}

/** One class the batch created, named by the CSV line it came from. */
export interface CommittedLine {
  line: number
  eventId: number
}

/** One line the batch created nothing for, and every reason it did not. */
export interface SkippedLine {
  line: number
  reasons: string[]
}

export interface CommitReport {
  committed: CommittedLine[]
  skipped: SkippedLine[]
}

/**
 * The batch's last word, for the response that outlives it.
 *
 * ⚠ **This is the only account of the import a caller ever gets.** The finish
 * hard-deletes the batch, so a volunteer reading "4 rows skipped" has no row
 * left to open — the line and its reason have to travel in the response or they
 * are gone. Every other chunk's caller reads them off the batch.
 */
export function commitReport(rows: readonly CommitRow[]): CommitReport {
  const committed: CommittedLine[] = []
  const skipped: SkippedLine[] = []

  for (const row of rows) {
    if (row.committed) {
      committed.push({ line: row.line, eventId: row.committed.eventId })
      continue
    }
    const reasons = [...(row.errors ?? []), ...duplicateReason(row)]
    skipped.push({ line: row.line, reasons })
  }

  return { committed, skipped }
}

/**
 * Why a matched row was left alone, in the words the review showed.
 *
 * A duplicate carries no `errors` — it is not a fault, and nothing about the
 * class it repeats is modified (`resolve/duplicates.ts`).
 *
 * ⚠ **Exported because the review really does have to show these words.** The
 * review table and this report are read minutes apart by the same volunteer, and
 * the batch is deleted in between — so a second spelling here would read as the
 * commit having found a different duplicate from the one they approved skipping.
 */
export function duplicateReason(row: CommitRow): string[] {
  if (!row.duplicate) return []
  const { line, eventId } = row.duplicate
  if (line !== undefined) return [`a repeat of line ${line}`]
  return [eventId !== undefined ? `a repeat of class #${eventId}` : 'a repeat of an existing class']
}

export function tallyRows(rows: readonly CommitRow[]): CommitTally {
  const committed = rows.filter((row) => row.committed)
  const verified = committed.filter((row) => managerKeyOf(row.values ?? {}) !== null).length

  return {
    total: rows.length,
    committed: committed.length,
    verified,
    unverified: committed.length - verified,
    duplicates: rows.filter((row) => row.duplicate).length,
    errors: rows.filter((row) => row.errors?.length).length,
  }
}
