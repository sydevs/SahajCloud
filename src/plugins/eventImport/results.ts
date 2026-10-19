/**
 * One line per CSV row, as the import page shows it: the class it created, or
 * why it was skipped.
 *
 * ⚠ **Created classes are matched to rows by order.** The plugin's hooks never
 * see the ids it creates, but it creates the rows our `before` hook passed on
 * one at a time and in row order, so the import's classes sorted by id line up
 * with the submitted rows that did not fail. A count that disagrees is logged
 * by the caller and the extra rows keep no link rather than a wrong one.
 *
 * Pure and server-free: the admin component reads these types.
 */

import type { SkippedRow, SubmittedRow } from './run'

/** How a row ended, before anyone acted on its class. */
export type ImportOutcome = 'created' | 'duplicate' | 'error'

export interface ImportResultRow {
  row: number
  outcome: ImportOutcome
  /** The class the row created, for an outcome of `created`. */
  eventId?: number
  title: string
  city: string
  /** Why a row was skipped. */
  reasons?: string[]
  /** The row as uploaded, kept for a skipped row so it can be downloaded and fixed. */
  values?: Record<string, string>
}

/** The duplicate refusal's own sentence (`refuseDuplicateClass`). */
const DUPLICATE = /\brepeats #\d+/

export function buildResults(
  submitted: readonly SubmittedRow[],
  skipped: readonly SkippedRow[],
  createdIds: readonly number[],
): { rows: ImportResultRow[]; matched: boolean } {
  const failed = new Set(skipped.map(({ row }) => row))
  const created = submitted.filter(({ row }) => !failed.has(row)).sort((a, b) => a.row - b.row)
  const matched = created.length === createdIds.length

  const rows: ImportResultRow[] = [
    ...created.map(({ row, values }, index) => ({
      row,
      outcome: 'created' as const,
      ...(matched ? { eventId: createdIds[index] } : {}),
      title: values.title ?? '',
      city: values.city ?? '',
    })),
    ...skipped.map(({ row, reasons, values }) => ({
      row,
      outcome: reasons.some((reason) => DUPLICATE.test(reason))
        ? ('duplicate' as const)
        : ('error' as const),
      title: values.title ?? '',
      city: values.city ?? '',
      reasons,
      values,
    })),
  ]
  return { rows: rows.sort((a, b) => a.row - b.row), matched }
}
