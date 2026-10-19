/**
 * A CSV row as the plugin parsed it, reduced to the import's own columns.
 *
 * The plugin's parser (`csv-parse` with `columns: true`, `cast`) hands over
 * objects keyed by header cell, with bare numbers already cast — so a postcode
 * arrives as `10999` and is put back into a string here. Columns the template
 * does not declare are dropped, which is how the skipped-lines file's own
 * `error` column comes back harmlessly.
 */

import { IMPORT_COLUMNS, isImportColumn, type RawImportRow, requiredColumnsFor } from './csv/columns'

const COLUMN_NAMES = IMPORT_COLUMNS.map(({ name }) => name)

export function normaliseRow(raw: Record<string, unknown>): RawImportRow {
  const values: RawImportRow = {}
  for (const name of COLUMN_NAMES) {
    const value = raw[name]
    values[name] = value === undefined || value === null ? '' : String(value).trim()
  }
  return values
}

/**
 * Why the header cannot be used, or null.
 *
 * ⚠ **An unrecognised header is a refusal, not an ignored column.** A
 * misspelled `titel` would otherwise drop every title in the file silently.
 * A header starting with `#` is the one exception: the skipped-lines file's
 * `#error` column, which is meant to come back with the fixed rows.
 */
export function checkHeader(header: readonly string[]): string | null {
  const names = header.map((cell) => cell.replace(/\p{Cf}/gu, '').trim()).filter(Boolean)
  const unknown = names.filter((name) => !name.startsWith('#') && !isImportColumn(name))
  if (unknown.length) {
    const hint =
      names.length === 1
        ? ' The header reads as a single column, so the file is probably not comma-separated; save it as "CSV UTF-8 (Comma delimited)".'
        : ' Download the template and use its header row.'
    return `Unrecognised column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.${hint}`
  }
  const missing = requiredColumnsFor(undefined).filter((name) => !names.includes(name))
  if (missing.length) {
    return `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`
  }
  return null
}
