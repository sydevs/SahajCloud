/**
 * Parse an uploaded CSV into rows, and refuse the file when the problem is the
 * file rather than a row.
 *
 * ⚠ **This step checks structure only — which columns exist, and whether each
 * row filled the ones its `eventType` owes.** It deliberately does not map the
 * schedule or the location: both need the row's timezone, which is only known
 * after the resolve step has geocoded it. Validating here on an assumed zone
 * would put a row's whole recurrence hours out, and the error would surface as
 * a wrong time rather than as a refusal.
 */

import { parse } from 'csv-parse/sync'

import { MAX_IMPORT_ROWS } from '../constants'
import { IMPORT_COLUMN_NAMES, findColumn, requiredColumnsFor, type RawImportRow } from './columns'

/** The `eventType` values a row may declare. */
const EVENT_TYPES = ['offline', 'online'] as const

export interface ParsedRow {
  /**
   * The row's line in the uploaded file, 1-based and counting the header — what
   * a spreadsheet shows in its row gutter, so an error names a line the
   * volunteer can navigate to.
   */
  line: number
  values: RawImportRow
  /** Structural problems. A row with any of these is skipped, never committed. */
  errors: string[]
}

export type ParseCsvResult =
  /** The file is unusable, so no row was examined. */
  | { ok: false; error: string }
  | { ok: true; rows: ParsedRow[] }

/**
 * The template's instruction row. Skipped so a volunteer who leaves it in does
 * not read "row 1 is invalid" about text we wrote (`template.ts`).
 */
function isHelpRow(record: string[]): boolean {
  return record[0]?.trimStart().startsWith('#') ?? false
}

function isBlankRow(record: string[]): boolean {
  return record.every((value) => !value?.trim())
}

export function parseImportCsv(input: string): ParseCsvResult {
  let records: string[][]
  try {
    records = parse(input, {
      bom: true,
      relaxColumnCount: true,
      // ⚠ **Blank lines are kept, not skipped.** `skipEmptyLines` drops them
      // during parsing, so they never reach the counter below and every row
      // after one reports a line number lower than the volunteer's spreadsheet
      // shows. They are filtered here instead, where the count can advance.
      skipEmptyLines: false,
      // Read as arrays rather than objects: `columns: true` would make the
      // header both the parse contract and the validation subject, so a
      // misspelled header would silently become an unknown key instead of the
      // named refusal below.
      columns: false,
    }) as string[][]
  } catch (error) {
    return { ok: false, error: `The file could not be read as CSV: ${message(error)}` }
  }

  const header = records.shift()
  if (!header) return { ok: false, error: 'The file is empty.' }

  const headerCheck = checkHeader(header)
  if (!headerCheck.ok) return headerCheck

  const dataRecords = records.filter((record) => !isHelpRow(record) && !isBlankRow(record))
  if (!dataRecords.length) {
    return { ok: false, error: 'The file has a header but no data rows.' }
  }
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `The file has ${dataRecords.length} data rows; the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.`,
    }
  }

  // Lines are counted over the ORIGINAL records, so a skipped help row still
  // advances the number a volunteer sees in their spreadsheet.
  let line = 1
  const rows: ParsedRow[] = []
  for (const record of records) {
    line += 1
    if (isHelpRow(record) || isBlankRow(record)) continue
    rows.push(buildRow(record, headerCheck.columns, line))
  }

  return { ok: true, rows }
}

type HeaderCheck = { ok: true; columns: (string | null)[] } | { ok: false; error: string }

/**
 * Map each header cell to a column name, or refuse.
 *
 * ⚠ **An unrecognised header is a refusal, not an ignored column.** A
 * misspelled `titel` would otherwise drop every title in the file silently, and
 * the template is generated from the same spec, so a volunteer who used it
 * cannot hit this.
 */
function checkHeader(header: string[]): HeaderCheck {
  const columns: (string | null)[] = []
  const unknown: string[] = []
  const seen = new Set<string>()
  const duplicated: string[] = []

  for (const cell of header) {
    const name = cell?.trim() ?? ''
    // A trailing empty column is what a spreadsheet export adds, not what a
    // volunteer typed, so it is dropped rather than reported.
    if (!name) {
      columns.push(null)
      continue
    }
    if (!findColumn(name)) {
      unknown.push(name)
      columns.push(null)
      continue
    }
    if (seen.has(name)) duplicated.push(name)
    seen.add(name)
    columns.push(name)
  }

  if (unknown.length) {
    return {
      ok: false,
      error: `Unrecognised column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Download the template and use its header row.`,
    }
  }
  if (duplicated.length) {
    return { ok: false, error: `Duplicated column${duplicated.length > 1 ? 's' : ''}: ${[...new Set(duplicated)].join(', ')}.` }
  }

  const missing = IMPORT_COLUMN_NAMES.filter(
    (name) => !seen.has(name) && findColumn(name)?.requirement === 'always',
  )
  if (missing.length) {
    return { ok: false, error: `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.` }
  }

  return { ok: true, columns }
}

function buildRow(record: string[], columns: (string | null)[], line: number): ParsedRow {
  const values: RawImportRow = {}
  columns.forEach((name, index) => {
    if (!name) return
    values[name] = record[index]?.trim() ?? ''
  })

  const errors: string[] = []
  const eventType = values.eventType?.toLowerCase()
  if (eventType) values.eventType = eventType

  if (!eventType) {
    errors.push('eventType is required')
  } else if (!(EVENT_TYPES as readonly string[]).includes(eventType)) {
    errors.push(`eventType must be offline or online (got "${eventType}")`)
  }

  for (const name of requiredColumnsFor(eventType)) {
    if (name === 'eventType') continue
    if (!values[name]) errors.push(`${name} is required`)
  }

  return { line, values, errors }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
