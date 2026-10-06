/**
 * The lines a commit skipped, as a CSV the volunteer can fix and upload again.
 *
 * ⚠ **The template's own columns, in its order, plus `error` at the end.** The
 * file goes back through the same upload, which refuses an unknown column — so
 * the extra one is named the way the parser ignores it, and a volunteer deletes
 * nothing before re-uploading. Pure and dependency-free, because the review
 * screen builds the same file in the browser that the report email attaches.
 */

import { IMPORT_COLUMNS } from '../csv/columns'

/** What one skipped line carries in a commit report. */
export interface SkippedRowForCsv {
  line: number
  reasons: readonly string[]
  values: Readonly<Record<string, string>>
}

/** The column the reasons travel in. */
export const SKIPPED_REASON_COLUMN = '#error'

export function skippedRowsCsv(rows: readonly SkippedRowForCsv[]): string {
  const columns = IMPORT_COLUMNS.map((column) => column.name)
  const lines = [[...columns, SKIPPED_REASON_COLUMN].map(cell).join(',')]
  for (const row of rows) {
    lines.push(
      [
        ...columns.map((column) => cell(row.values[column] ?? '')),
        cell(`line ${row.line}: ${row.reasons.join('; ')}`),
      ].join(','),
    )
  }
  // A BOM, so Excel opens it as UTF-8 rather than mangling every accent.
  return `﻿${lines.join('\r\n')}\r\n`
}

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}
