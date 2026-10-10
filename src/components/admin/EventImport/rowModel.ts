/**
 * What the rows table says about one line of the file.
 *
 * Pure, so the wording and the "needs a look" rule are unit-testable without a
 * DOM — and so the component holds only markup. Everything here reads the stored
 * row (`EventImports.rows`); nothing re-derives a fact a job already settled.
 */

import type { EventImportRows } from '@/payload-types'

export type ImportRow = EventImportRows[number]

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
export function rowStatus(row: ImportRow): RowStatus {
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
export function needsAttention(row: ImportRow): boolean {
  const status = rowStatus(row)
  return status === 'duplicate' || status === 'error' || !!row.warnings?.length
}

/** The class as the file named it. */
export function rowTitle(row: ImportRow): string {
  return row.values.title?.trim() || '—'
}

/** Where it meets, as specifically as the file says. */
export function rowPlace(row: ImportRow): string {
  const parts = [row.values.venueName, row.values.city].map((part) => part?.trim()).filter(Boolean)
  return parts.length ? parts.join(', ') : row.values.onlineUrl?.trim() ? 'Online' : '—'
}

/** Everything the import has to say about the row, errors first. */
export function rowNotes(row: ImportRow): string {
  const notes = [...(row.errors ?? []), ...(row.warnings ?? [])]
  return notes.length ? notes.join('; ') : '—'
}

/** What kind of match this is, in a reviewer's words. */
export function duplicateNote(row: ImportRow): null | string {
  const duplicate = row.duplicate
  if (!duplicate) return null
  const where =
    duplicate.reason === 'nearby-address'
      ? 'the same address'
      : 'the same town, at about the same time'
  const what =
    duplicate.line === undefined
      ? 'a class already in the Atlas'
      : `line ${duplicate.line} of this file`
  const strength = duplicate.strength === 'weak' ? 'possibly ' : ''
  return `${strength}${what}, at ${where}`
}

/** What the commit will do with a matched row, skipping unless told otherwise. */
export const DUPLICATE_ACTION_OPTIONS = [
  { label: 'Skip it', value: 'skip' },
  { label: 'Import it anyway', value: 'import' },
] as const

export type DuplicateAction = (typeof DUPLICATE_ACTION_OPTIONS)[number]['value']

/**
 * The rows with one line's duplicate decision changed.
 *
 * ⚠ **A new array of new rows, and only the row named is rebuilt.** The field
 * value goes to `hooks/reviewerEdits.ts`, which refuses any delta outside
 * `duplicate.action` — so mutating a row in place would both mislead React and
 * risk carrying an edit the hook then refuses for the whole save.
 */
export function withDuplicateAction(
  rows: readonly ImportRow[],
  line: number,
  action: DuplicateAction,
): ImportRow[] {
  return rows.map((row) =>
    row.line === line && row.duplicate
      ? { ...row, duplicate: { ...row.duplicate, action } }
      : row,
  )
}
