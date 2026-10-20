/**
 * One line per CSV row, as the import page shows it: the class it created, or
 * why it was skipped.
 *
 * Pure and server-free: the admin component reads these types.
 */

import type { CreatedRow, DuplicateOf, MissingCity, SkippedRow } from './run'

/** How a row ended, before anyone acted on its class. */
export type ImportOutcome = 'created' | 'duplicate' | 'error'

export interface ImportResultRow {
  /** The row's line in the volunteer's spreadsheet. */
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
  /** The town a row was skipped for having no city region, so the page can offer to create it. */
  missingCity?: MissingCity
  /** What a duplicate row repeats. */
  duplicateOf?: DuplicateOf
}

export function buildResults(
  created: readonly CreatedRow[],
  skipped: readonly SkippedRow[],
): ImportResultRow[] {
  return [
    ...created.map(({ row, values, eventId }) => ({
      row,
      outcome: 'created' as const,
      eventId,
      title: values.title ?? '',
      city: values.city ?? '',
    })),
    ...skipped.map(({ row, reasons, values, missingCity, duplicateOf }) => ({
      row,
      outcome: duplicateOf ? ('duplicate' as const) : ('error' as const),
      title: values.title ?? '',
      city: values.city ?? '',
      reasons,
      values,
      ...(missingCity ? { missingCity } : {}),
      ...(duplicateOf ? { duplicateOf } : {}),
    })),
  ].sort((a, b) => a.row - b.row)
}
