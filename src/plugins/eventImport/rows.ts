/**
 * A CSV row as the plugin parsed it, reduced to the import's own columns.
 *
 * The plugin's parser (`csv-parse` with `columns: true`, `cast`) hands over
 * objects keyed by header cell, with bare numbers already cast — so a postcode
 * arrives as `10999` and is put back into a string here. Columns the template
 * does not declare are dropped, which is how the skipped-lines file's own
 * `error` column comes back harmlessly.
 */

import { IMPORT_COLUMNS, type RawImportRow } from './csv/columns'
import { LINE_COLUMN } from './csv/upload'

const COLUMN_NAMES = IMPORT_COLUMNS.map(({ name }) => name)

export function normaliseRow(raw: Record<string, unknown>): RawImportRow {
  const values: RawImportRow = {}
  for (const name of COLUMN_NAMES) {
    const value = raw[name]
    values[name] = value === undefined || value === null ? '' : String(value).trim()
  }
  return values
}

/** The spreadsheet line the upload recorded for this row (`csv/upload.ts`). */
export function lineOf(raw: Record<string, unknown>): number {
  return Number(raw[LINE_COLUMN])
}
