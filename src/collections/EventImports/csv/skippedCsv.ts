/**
 * The lines a commit skipped, as a CSV the volunteer can fix and upload again.
 *
 * ⚠ **The template's own columns, in its order, plus one for the reasons.** The
 * file goes back through the same upload, which refuses an unrecognised column —
 * so the extra one is named with the `#` prefix `checkHeader` skips (`parse.ts`),
 * and a volunteer deletes nothing before re-uploading.
 *
 * ⚠ **Pure and server-free, because the browser builds it.** `ReportDownload`
 * runs this in the admin panel on the batch's stored `report`, so nothing here
 * may reach Payload, the request or the filesystem.
 */

import { stringify } from 'csv-stringify/browser/esm/sync'

import { IMPORT_COLUMNS, UTF8_BOM } from './columns'

/** What one skipped line carries in a commit report. */
export interface SkippedRowForCsv {
  line: number
  reasons: readonly string[]
  values: Readonly<Record<string, string>>
}

/** The column the reasons travel in, prefixed so a re-upload ignores it. */
export const SKIPPED_REASON_COLUMN = '#error'

export function skippedRowsCsv(rows: readonly SkippedRowForCsv[]): string {
  const columns = IMPORT_COLUMNS.map((column) => column.name)
  const records = rows.map((row) => [
    ...columns.map((column) => row.values[column] ?? ''),
    `line ${row.line}: ${row.reasons.join('; ')}`,
  ])
  return `${UTF8_BOM}${stringify([[...columns, SKIPPED_REASON_COLUMN], ...records])}`
}

export const SKIPPED_CSV_FILENAME = 'sahaj-atlas-skipped-lines.csv'
