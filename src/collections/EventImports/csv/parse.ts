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

import type { Event } from '@/payload-types'

import { MAX_IMPORT_ROWS } from '../constants'
import { isImportColumn, requiredColumnsFor, type RawImportRow } from './columns'

/**
 * The `eventType` values a row may declare.
 *
 * `satisfies` against the generated union is what stops this drifting wider
 * than the column: adding a value the CMS does not enumerate is a compile
 * error here, rather than a row that type-checks and is refused at write.
 */
const EVENT_TYPES = ['offline', 'online'] as const satisfies readonly Event['eventType'][]

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

function plural(count: number, word: string): string {
  return count > 1 ? `${word}s` : word
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
  const width = headerCheck.columns.length

  // One pass: the line counter has to walk every record to stay aligned with
  // the volunteer's spreadsheet, and `rows.length` is the data-row count the
  // refusals below need, so a separate filtering pass would only re-test the
  // same two predicates.
  let line = 1
  const rows: ParsedRow[] = []
  for (const record of records) {
    line += 1
    if (isHelpRow(record) || isBlankRow(record)) continue
    rows.push(buildRow(record, headerCheck.columns, line, width))
  }

  if (!rows.length) return { ok: false, error: 'The file has a header but no data rows.' }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `The file has ${rows.length} data rows; the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.`,
    }
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
  const duplicated = new Set<string>()

  for (const cell of header) {
    const name = cell?.trim() ?? ''
    // A trailing empty column is what a spreadsheet export adds, not what a
    // volunteer typed, so it is dropped rather than reported.
    if (!name) {
      columns.push(null)
      continue
    }
    if (!isImportColumn(name)) {
      unknown.push(name)
      columns.push(null)
      continue
    }
    if (seen.has(name)) duplicated.add(name)
    seen.add(name)
    columns.push(name)
  }

  if (unknown.length) {
    return {
      ok: false,
      error: `Unrecognised ${plural(unknown.length, 'column')}: ${unknown.join(', ')}. Download the template and use its header row.`,
    }
  }
  if (duplicated.size) {
    return {
      ok: false,
      error: `Duplicated ${plural(duplicated.size, 'column')}: ${[...duplicated].join(', ')}.`,
    }
  }

  // `requiredColumnsFor(undefined)` is the always-required set — the same
  // answer the row check below starts from, rather than a second derivation.
  const missing = requiredColumnsFor(undefined).filter((name) => !seen.has(name))
  if (missing.length) {
    return {
      ok: false,
      error: `Missing required ${plural(missing.length, 'column')}: ${missing.join(', ')}.`,
    }
  }

  return { ok: true, columns }
}

function buildRow(
  record: string[],
  columns: (string | null)[],
  line: number,
  width: number,
): ParsedRow {
  const values: RawImportRow = {}
  columns.forEach((name, index) => {
    if (!name) return
    values[name] = record[index]?.trim() ?? ''
  })

  const errors: string[] = []

  // ⚠ **An over-wide row is a refusal, not a truncation.** `relaxColumnCount`
  // keeps the parse from throwing, but the positional read above then stops at
  // the header width — so an unescaped comma inside an address shifts every
  // later value one column left and drops the last. Reported here, the
  // volunteer is pointed at the row rather than at whichever column the shift
  // happened to make invalid.
  const filled = record.reduce((last, value, index) => (value?.trim() ? index + 1 : last), 0)
  if (filled > width) {
    errors.push(
      `this row has ${filled} values but the header has ${width} columns — check for an unquoted comma`,
    )
  }
  const eventType = values.eventType?.toLowerCase()
  if (eventType) values.eventType = eventType

  if (!eventType) {
    errors.push('eventType is required')
  } else if (!(EVENT_TYPES as readonly string[]).includes(eventType)) {
    errors.push(`eventType must be ${EVENT_TYPES.join(' or ')} (got "${eventType}")`)
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
