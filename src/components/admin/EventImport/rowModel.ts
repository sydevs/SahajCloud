/**
 * What the rows table says about one line of the file, beyond what the commit
 * already has words for.
 *
 * ⚠ **Every refusal reason comes from `commit/rows.ts`'s `skipReasons`, never
 * from here.** That function's own ⚠ says why: the review's Notes column, the
 * skipped-lines CSV and the summary email are read minutes apart by the same
 * person, so a second spelling reads as a different fault. What this module adds
 * is only the table's own vocabulary — a status, a place, and which lines a
 * reviewer has to look at.
 */

import { duplicateAction, skipReasons, type CommitRow } from '@/collections/EventImports/commit/rows'

export type RowStatus = 'committed' | 'duplicate' | 'error' | 'pending' | 'ready'

export const ROW_STATUS_LABEL: Record<RowStatus, string> = {
  committed: 'Created',
  duplicate: 'Possible duplicate',
  error: 'Will be skipped',
  pending: 'Looking up the address',
  ready: 'Ready',
}

/**
 * Where a row stands.
 *
 * ⚠ **Order is the meaning.** A committed row is history whatever else it
 * carries, an errored row is skipped whether or not it also matched something,
 * and an unresolved row has no answers for a duplicate check to have run
 * against — so reading a later state off it would claim an answer nobody gave.
 */
export function rowStatus(row: CommitRow): RowStatus {
  if (row.committed) return 'committed'
  if (row.errors?.length) return 'error'
  if (!row.resolved) return 'pending'
  if (row.duplicate) return 'duplicate'
  return 'ready'
}

/**
 * Whether a reviewer has something to do with this row, or to know about it.
 *
 * In a 500-line batch, finding the twelve that matter among every line is
 * otherwise the reviewer's whole job — so the table shows these first and the
 * rest only when asked.
 */
export function needsAttention(row: CommitRow): boolean {
  const status = rowStatus(row)
  return status === 'duplicate' || status === 'error' || !!row.warnings?.length
}

/** The class as the file named it. */
export function rowTitle(row: CommitRow): string {
  return row.values.title?.trim() || '—'
}

/** Where it meets, as specifically as the file says. */
export function rowPlace(row: CommitRow): string {
  const parts = [row.values.venueName, row.values.city].map((part) => part?.trim()).filter(Boolean)
  return parts.length ? parts.join(', ') : row.values.onlineUrl?.trim() ? 'Online' : '—'
}

/**
 * Everything the import has to say about the row.
 *
 * The commit's own refusals first, in its words, then the warnings it does not
 * count as refusals.
 */
export function rowNotes(row: CommitRow): string {
  const notes = [...skipReasons(row), ...(row.warnings ?? [])]
  return notes.length ? notes.join('; ') : '—'
}

/** What the commit will do with a matched row, skipping unless told otherwise. */
export const DUPLICATE_ACTION_OPTIONS = [
  { label: 'Skip it', value: 'skip' },
  { label: 'Import it anyway', value: 'import' },
] as const

export type DuplicateAction = (typeof DUPLICATE_ACTION_OPTIONS)[number]['value']

/** The chosen action's label, for a row whose choice can no longer be changed. */
export function duplicateActionLabel(row: CommitRow): string {
  const chosen = duplicateAction(row)
  return DUPLICATE_ACTION_OPTIONS.find((option) => option.value === chosen)?.label ?? chosen
}

/**
 * The rows with one line's duplicate decision changed.
 *
 * ⚠ **A new array of new rows, and only the row named is rebuilt.** The field
 * value goes to `hooks/reviewerEdits.ts`, which refuses any delta outside
 * `duplicate.action` — so mutating a row in place would both mislead React and
 * risk carrying an edit the hook then refuses for the whole save.
 */
export function withDuplicateAction(
  rows: readonly CommitRow[],
  line: number,
  action: DuplicateAction,
): CommitRow[] {
  return rows.map((row) =>
    row.line === line && row.duplicate ? { ...row, duplicate: { ...row.duplicate, action } } : row,
  )
}
