/**
 * Parse an uploaded CSV into rows, and refuse the file when the problem is the
 * file rather than a row.
 *
 * ⚠ **This step checks structure and single values only — which columns exist,
 * whether each row filled the ones its `eventType` owes, and whether each value
 * is one `events` would store.** It deliberately does not map the schedule or
 * the location: both need the row's timezone, which is only known after the
 * resolve step has geocoded it. Validating here on an assumed zone would put a
 * row's whole recurrence hours out, and the error would surface as a wrong time
 * rather than as a refusal.
 */

import { CsvError, parse } from 'csv-parse/sync'

import type { Event } from '@/payload-types'

import { MAX_IMPORT_ROWS } from '../constants'
import { isImportColumn, requiredColumnsFor, type RawImportRow } from './columns'
import { checkRowFields, echo } from './fieldChecks'
import { SCHEDULE_TYPES } from './schedule'
import { isTemplateExampleRow, isTemplateHelpRow } from './template'

/**
 * The `eventType` values a row may declare.
 *
 * `satisfies` against the generated union is what stops this drifting wider
 * than the column: adding a value the CMS does not enumerate is a compile
 * error here, rather than a row that type-checks and is refused at write.
 */
const EVENT_TYPES = ['offline', 'online'] as const satisfies readonly Event['eventType'][]

/**
 * How many records, blank ones included, the parser is handed at most.
 *
 * ⚠ **This bound is what keeps a hostile upload cheap, not the row cap.**
 * csv-parse builds an error object for every record narrower than the header —
 * a blank line is one — and that costs about 9 µs each, so 500,000 bare newlines
 * held a worker for 4.6 s before a single row was examined. Trailing blank rows
 * are cut before counting, so only blanks *between* classes count here.
 */
const MAX_PARSED_RECORDS = MAX_IMPORT_ROWS * 4

const DELIMITERS = [',', ';', '\t'] as const
type Delimiter = (typeof DELIMITERS)[number]

const DELIMITER_NAMES: Record<Delimiter, string> = { ',': 'comma', ';': 'semicolon', '\t': 'tab' }

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
  /** Things the reviewer should see that do not stop the row. Absent when none. */
  warnings?: string[]
}

export type ParseCsvResult =
  /** The file is unusable, so no row was examined. */
  | { ok: false; error: string }
  | { ok: true; rows: ParsedRow[] }

/**
 * Whether a record is a volunteer's own note: it starts with `#`, and neither
 * its `eventType` nor its `scheduleType` holds a value a class could have.
 *
 * ⚠ **The second half is what keeps a real class.** `#1 Beginners Class` and
 * `#204-1234 Main St` start with `#` too, and dropping them silently is the
 * failure the help-row match exists to avoid — but a class names a real
 * `eventType` or `scheduleType`, and a note does not. Not "both columns blank":
 * a note with a comma in it spills its second half into the next column.
 */
function isCommentRow(record: readonly string[], columns: readonly (null | string)[]): boolean {
  const first = record.find((cell) => cell?.trim())
  if (!first?.trim().startsWith('#')) return false
  const valueOf = (name: string) => {
    const index = columns.indexOf(name)
    return index === -1 ? '' : (record[index]?.trim().toLowerCase() ?? '')
  }
  return (
    !(EVENT_TYPES as readonly string[]).includes(valueOf('eventType')) &&
    !(SCHEDULE_TYPES as readonly string[]).includes(valueOf('scheduleType'))
  )
}

function isBlankRow(record: string[]): boolean {
  return record.every((value) => !value?.trim())
}

function plural(count: number, word: string): string {
  return count > 1 ? `${word}s` : word
}

export function parseImportCsv(input: string): ParseCsvResult {
  const text = input.startsWith('\uFEFF') ? input.slice(1) : input

  const encodingError = checkEncoding(text)
  if (encodingError) return { ok: false, error: encodingError }

  const delimiter = sniffDelimiter(text)
  const body = withoutTrailingBlankRows(text, delimiter)
  if (!body.trim()) return { ok: false, error: 'The file is empty.' }

  const shape = countRecords(body, delimiter)
  // The header plus one help row may sit above the data. The exact count is
  // taken after parsing; this only spares the parse a file far past the cap.
  if (shape.filled - 2 > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `The file has more than ${MAX_IMPORT_ROWS} data rows; the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.`,
    }
  }
  if (shape.records > MAX_PARSED_RECORDS) {
    return {
      ok: false,
      error: `The file has ${shape.records - shape.filled} empty rows between its classes. Delete the empty rows and upload it again.`,
    }
  }

  let records: string[][]
  try {
    records = parse(body, {
      delimiter,
      // ⚠ **All three endings at once.** Left unset, csv-parse adopts the
      // first ending it meets and reads every other kind as text, so a file
      // stitched together from a CRLF export and a hand-typed LF tail merged
      // each LF row into the one above it.
      record_delimiter: ['\r\n', '\n', '\r'],
      relaxColumnCount: true,
      // A quote inside an unquoted value (`Anna "Annie" class`) is text, and
      // whitespace before an opening quote (`, "Str 1, Hof"`) still opens one —
      // both are how a spreadsheet user types, and both refused the whole file.
      relaxQuotes: true,
      ltrim: true,
      rtrim: true,
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
    return { ok: false, error: csvErrorMessage(error) }
  }

  const header = records.shift()
  if (!header) return { ok: false, error: 'The file is empty.' }

  const headerCheck = checkHeader(header, delimiter)
  if (!headerCheck.ok) return headerCheck

  // One pass: the line counter has to walk every record to stay aligned with
  // the volunteer's spreadsheet, and `rows.length` is the data-row count the
  // refusals below need, so a separate filtering pass would only re-test the
  // same two predicates.
  let line = 1
  const rows: ParsedRow[] = []
  for (const record of records) {
    line += 1
    if (isBlankRow(record) || isTemplateHelpRow(record)) continue
    if (isCommentRow(record, headerCheck.columns)) continue
    const unnamed = valueUnderUnnamedColumn(record, headerCheck.unnamed)
    if (unnamed) {
      return {
        ok: false,
        error: `Column ${columnLetter(unnamed.index)} has no name in the header row, but line ${line} has a value in it (got "${echo(unnamed.value)}"). Name the column as the template does, or delete it.`,
      }
    }
    rows.push(buildRow(record, headerCheck.columns, line, header.length, delimiter))
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

/**
 * Refuse text that was not UTF-8 before it reached us.
 *
 * ⚠ **The browser decodes the file as UTF-8 whatever it was** (`File.text()`),
 * so a Windows-1252 "CSV (Comma delimited)" export arrives with every `ü` as
 * U+FFFD — and imported, that publishes `M�nchen`. Nothing downstream can undo
 * it, so the file is refused here with the export setting that fixes it.
 */
function checkEncoding(text: string): string | null {
  if (text.includes('\u0000')) {
    return 'This file is saved as UTF-16 ("Unicode Text"), which the import cannot read. Save it as "CSV UTF-8 (Comma delimited)" and upload it again.'
  }
  const bad = text.indexOf('\uFFFD')
  if (bad === -1) return null
  const line = (text.slice(0, bad).match(/\r\n|\r|\n/g)?.length ?? 0) + 1
  const start = text.lastIndexOf('\n', bad) + 1
  const end = text.indexOf('\n', bad)
  const excerpt = text.slice(start, end === -1 ? undefined : end).trim()
  return `This file is not UTF-8, so its accented letters cannot be read — line ${line} has one (got "${echo(excerpt)}"). In Excel, save it as "CSV UTF-8 (Comma delimited)"; in Google Sheets, download it as CSV. Then upload it again.`
}

/**
 * The delimiter the header line uses.
 *
 * Excel in most of Europe saves `;`-separated "CSV", and a copy out of Google
 * Sheets is tab-separated; read as commas, either became one unknown column.
 * No column name holds any of the three, so the most frequent one is the answer.
 */
function sniffDelimiter(text: string): Delimiter {
  const end = text.search(/[\r\n]/)
  const headerLine = end === -1 ? text : text.slice(0, end)
  let best: Delimiter = ','
  let bestCount = 0
  for (const candidate of DELIMITERS) {
    const count = headerLine.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

const isRowSpace = (char: string, delimiter: Delimiter) =>
  char === delimiter || char === ' ' || char === '\t' || char === '\r' || char === '\n'

/**
 * The text without the empty rows after the last value.
 *
 * A spreadsheet that ever had formatting below its data exports thousands of
 * `,,,,` rows there. Cut on characters alone, never quoting: everything removed
 * is delimiters and whitespace, so no value can be lost.
 */
function withoutTrailingBlankRows(text: string, delimiter: Delimiter): string {
  let last = text.length - 1
  while (last >= 0 && isRowSpace(text[last]!, delimiter)) last -= 1
  if (last < 0) return ''
  const lineEnd = text.slice(last).search(/[\r\n]/)
  return lineEnd === -1 ? text : text.slice(0, last + lineEnd)
}

/**
 * Records in the text and how many hold a value, in one linear scan.
 *
 * Quote-aware the way the parse is (an opening quote after leading whitespace
 * still opens), so a description with line breaks counts as one row. It decides
 * only the two bounds above, so a disagreement with csv-parse over a malformed
 * quote moves a bound by a row, never a value.
 */
function countRecords(text: string, delimiter: Delimiter): { records: number; filled: number } {
  let records = 0
  let filled = 0
  let quoted = false
  let fieldStart = true
  let content = false
  let open = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') index += 1
        else quoted = false
      }
      continue
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      records += 1
      if (content) filled += 1
      content = false
      fieldStart = true
      open = false
      continue
    }
    open = true
    if (char === delimiter) {
      fieldStart = true
    } else if (char !== ' ' && char !== '\t') {
      if (char === '"' && fieldStart) quoted = true
      content = true
      fieldStart = false
    }
  }
  if (open || quoted) {
    records += 1
    if (content) filled += 1
  }
  return { records, filled }
}

/**
 * csv-parse's refusal as a sentence naming the spreadsheet row.
 *
 * `records` is the count before the failing one, header included, so the
 * failing row is the next — the same numbering `ParsedRow.line` uses.
 */
function csvErrorMessage(error: unknown): string {
  if (!(error instanceof CsvError)) return 'The file could not be read as CSV.'
  const records = (error as CsvError & { records?: unknown }).records
  const where = typeof records === 'number' ? `Line ${records + 1}` : 'A line'
  switch (error.code) {
    case 'CSV_QUOTE_NOT_CLOSED':
      return `${where} opens a double quote (") that never closes, so the rest of the file reads as one value. Close the quote, or remove it.`
    case 'CSV_INVALID_CLOSING_QUOTE':
    case 'CSV_NON_TRIMABLE_CHAR_AFTER_CLOSING_QUOTE':
    case 'INVALID_OPENING_QUOTE':
      return `${where} has text straight after a closing double quote ("). Inside a quoted value, write a double quote as two ("").`
    default:
      return `${where} could not be read as CSV.`
  }
}

type HeaderCheck =
  | {
      ok: true
      columns: (string | null)[]
      /** Header cells left blank, which the data must leave blank too. */
      unnamed: number[]
    }
  | { ok: false; error: string }

/**
 * Map each header cell to a column name, or refuse.
 *
 * ⚠ **An unrecognised header is a refusal, not an ignored column.** A
 * misspelled `titel` would otherwise drop every title in the file silently, and
 * the template is generated from the same spec, so a volunteer who used it
 * cannot hit this.
 *
 * ⚠ **A header starting with `#` is the one deliberate exception.** It marks a
 * column we wrote for the volunteer to read — the skipped-rows file's `#error`
 * (`commit/skippedCsv.ts`) — which is meant to come back with the fixed rows.
 */
function checkHeader(header: string[], delimiter: Delimiter): HeaderCheck {
  const columns: (string | null)[] = []
  const unnamed: number[] = []
  const unknown: string[] = []
  const seen = new Set<string>()
  const duplicated = new Set<string>()

  header.forEach((cell, index) => {
    // Invisible format characters — a zero-width space pasted with a name, a
    // stray BOM from a concatenated file — make `title` fail to match `title`.
    const name = cell?.replace(/\p{Cf}/gu, '').trim() ?? ''
    if (!name) {
      unnamed.push(index)
      columns.push(null)
      return
    }
    if (name.startsWith('#')) {
      columns.push(null)
      return
    }
    if (!isImportColumn(name)) {
      unknown.push(name)
      columns.push(null)
      return
    }
    if (seen.has(name)) duplicated.add(name)
    seen.add(name)
    columns.push(name)
  })

  if (unknown.length) {
    // One unknown column holding every name is a delimiter we did not detect,
    // and naming that is more use than echoing the whole header back.
    const hint =
      unknown.length === 1 && header.length === 1
        ? ` The header reads as a single column, so the file may not be ${DELIMITER_NAMES[delimiter]}-separated; save it as "CSV UTF-8 (Comma delimited)".`
        : ' Download the template and use its header row.'
    return {
      ok: false,
      error: `Unrecognised ${plural(unknown.length, 'column')}: ${unknown.map(echo).join(', ')}.${hint}`,
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

  return { ok: true, columns, unnamed }
}

/**
 * The first value sitting under a blank header cell.
 *
 * ⚠ **Refused for the whole file, not the row.** The column has no name, so
 * every value in it would be dropped from every row without a word — and a
 * blank header is usually a name deleted by accident, not a column to discard.
 */
function valueUnderUnnamedColumn(
  record: string[],
  unnamed: number[],
): { index: number; value: string } | null {
  for (const index of unnamed) {
    const value = record[index]?.trim()
    if (value) return { index, value }
  }
  return null
}

/** The spreadsheet's letter for a 0-based column: 0 → A, 26 → AA. */
function columnLetter(index: number): string {
  let letters = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  }
  return letters
}

function buildRow(
  record: string[],
  columns: (string | null)[],
  line: number,
  headerWidth: number,
  delimiter: Delimiter,
): ParsedRow {
  const values: RawImportRow = {}
  columns.forEach((name, index) => {
    if (!name) return
    values[name] = record[index]?.trim() ?? ''
  })

  const errors: string[] = []

  // ⚠ **An over-wide row is a refusal, not a truncation — trailing empty cells
  // included.** A spreadsheet export writes every row at the header's width, so
  // a longer one means a value was split on an unquoted delimiter, shifting
  // every later value one column right. When the shifted-out last cell was
  // blank, the overflow is an empty cell, and ignoring it is how a description
  // landed in `website`.
  const overWide = record.length > headerWidth
  if (overWide) {
    const name = DELIMITER_NAMES[delimiter]
    errors.push(
      `line ${line} has ${record.length} values but the header has ${headerWidth} columns — a value containing a ${name} must be wrapped in double quotes`,
    )
  }
  const eventType = values.eventType?.toLowerCase()
  if (eventType) values.eventType = eventType

  if (!eventType) {
    errors.push('eventType is required')
  } else if (!(EVENT_TYPES as readonly string[]).includes(eventType)) {
    errors.push(`eventType must be ${EVENT_TYPES.join(' or ')} (got "${echo(eventType)}")`)
  }

  for (const name of requiredColumnsFor(eventType)) {
    if (name === 'eventType') continue
    if (!values[name]) errors.push(`${name} is required`)
  }

  if (isTemplateExampleRow(values)) {
    errors.push(
      `this is the template's example row — delete it, or replace it with one of your classes (got title "${echo(values.title ?? '')}")`,
    )
  }

  // Skipped on a shifted row: every value there sits under the wrong column,
  // so its complaints would point the volunteer at cells that are not wrong.
  if (overWide) return { line, values, errors }

  const checked = checkRowFields(values)
  errors.push(...checked.errors)
  return checked.warnings.length
    ? { line, values, errors, warnings: checked.warnings }
    : { line, values, errors }
}
