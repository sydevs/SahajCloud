/**
 * What a commit did, counted from the rows rather than tracked as it went.
 *
 * ⚠ **The rows are the only cumulative record, so every count has to come from
 * them.** A commit may be retried, and `ensureProposedRegions` and
 * `ensureCoordinators` re-establish their work on each run — so the last run's
 * own return reports the regions an earlier one created as adopted and its
 * coordinators as matched. Recomputing from `rows` gives the batch's total at
 * any point, so the report and the summary email cannot disagree about it.
 */

import type { CommitRow } from './rows'

import { UNLINKED_NOTE } from './coordinators'
import { managerKeyOf } from './managers'

export interface CommitTally {
  total: number
  /** Rows that reached the Atlas as a new class. */
  committed: number
  /**
   * Classes created with a linked coordinator. `syncVerificationOnSave` adopts
   * one on its create, so it lands `verified` on that coordinator's cadence.
   */
  verified: number
  /** Classes created with nobody vouching for them: published, and `unverified`. */
  unverified: number
  duplicates: number
  errors: number
}

/** One class the batch created, named by the CSV line it came from. */
export interface CommittedLine {
  line: number
  eventId: number
}

/** One line the batch created nothing for, every reason it did not, and the row itself. */
export interface SkippedLine {
  line: number
  reasons: string[]
  /** As uploaded, so the volunteer can download the skipped lines, fix and re-upload them. */
  values: Record<string, string>
}

export interface CommitReport {
  committed: CommittedLine[]
  skipped: SkippedLine[]
}

/**
 * The batch's last word, for the response that outlives it.
 *
 * ⚠ **This is the account of the import a volunteer keeps.** The nightly sweep
 * deletes the batch, so a volunteer reading "4 rows skipped" eventually has no
 * row left to open — the line, its reason and its values have to travel in the
 * report, which is what the skipped-rows download reads.
 */
export function commitReport(rows: readonly CommitRow[]): CommitReport {
  const committed: CommittedLine[] = []
  const skipped: SkippedLine[] = []

  for (const row of rows) {
    if (row.committed) {
      committed.push({ line: row.line, eventId: row.committed.eventId })
      continue
    }
    skipped.push({ line: row.line, reasons: skipReasons(row), values: row.values ?? {} })
  }

  return { committed, skipped }
}

/**
 * Every reason a row created nothing, in the words the volunteer will read.
 *
 * ⚠ **Exported because the review has to show exactly these words.** The review
 * table and this report are read minutes apart by the same person, and the batch
 * is deleted in between — so a second spelling there would read as the commit
 * having found a different fault from the one they approved skipping.
 *
 * `extra` is for a refusal that is not on the row yet: the proposal's own
 * `rowErrors`, which the commit folds on with `adoptTreeErrors` before it reads
 * any of this, and which the review has to fold on itself.
 */
export function skipReasons(row: CommitRow, extra: readonly string[] = []): string[] {
  return [...(row.errors ?? []), ...extra, ...duplicateReason(row)]
}

/**
 * Why a matched row was left alone.
 *
 * A duplicate carries no `errors` — it is not a fault, and nothing about the
 * class it repeats is modified (`resolve/duplicates.ts`).
 *
 * ⚠ **Private, unlike `skipReasons` above.** `resolve/duplicates.ts` exports a
 * `duplicateReason` of its own that answers the reason *enum*, so a second
 * exported one answering prose makes a grep for either return both.
 */
function duplicateReason(row: CommitRow): string[] {
  if (!row.duplicate || row.committed || (row.duplicate.action ?? 'skip') !== 'skip') return []
  const { atCommit, line, eventId, strength } = row.duplicate
  if (line !== undefined) return [`a repeat of line ${line}`]
  const what = eventId !== undefined ? `class #${eventId}` : 'an existing class'
  if (atCommit) return [`a repeat of ${what}, added after you reviewed this batch`]
  return [strength === 'weak' ? `possibly a repeat of ${what}` : `a repeat of ${what}`]
}

export function tallyRows(rows: readonly CommitRow[]): CommitTally {
  const created = rows.filter((row) => row.committed)
  // A row whose coordinator could not be linked was imported without one, so it
  // is unverified whatever its CSV named.
  const verified = created.filter(
    (row) =>
      managerKeyOf(row.values ?? {}) !== null &&
      !row.warnings?.some((warning) => warning.startsWith(UNLINKED_NOTE)),
  ).length

  return {
    total: rows.length,
    committed: created.length,
    verified,
    unverified: created.length - verified,
    duplicates: rows.filter((row) => row.duplicate && !row.committed).length,
    errors: rows.filter((row) => row.errors?.length).length,
  }
}
