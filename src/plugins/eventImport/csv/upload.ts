/**
 * The uploaded CSV, checked and cleaned before it is stored, so a file no
 * import can use is refused in the upload form rather than failing later in
 * the job — and what the job reads holds only the import's columns and real
 * rows.
 *
 * ⚠ **Every row keeps its spreadsheet line in a `#line` column.** Blank rows
 * and the template's help row are dropped here, which would otherwise shift
 * every later row's number away from the line the volunteer sees in their
 * spreadsheet. A `#` header is one the import ignores (`checkHeader`).
 */

import { CsvError, parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'

import { MAX_IMPORT_ROWS } from '../constants'
import { isImportColumn, requiredColumnsFor } from './columns'
import { isTemplateHelpRow } from './template'

/** The column the cleaned file carries each row's spreadsheet line in. */
export const LINE_COLUMN = '#line'

export type PreparedUpload = { ok: true; csv: string; rows: number } | { ok: false; error: string }

const SAVE_AS_CSV =
  'In Excel, choose Save As › "CSV UTF-8 (Comma delimited)"; in Google Sheets, File › Download › CSV.'

export function prepareUpload(filename: string, data: Buffer): PreparedUpload {
  if (!/\.csv$/i.test(filename)) {
    return { ok: false, error: `Upload a CSV file (.csv). ${SAVE_AS_CSV}` }
  }
  if (isUtf16(data)) {
    return { ok: false, error: `This file is saved as UTF-16 ("Unicode Text"). ${SAVE_AS_CSV}` }
  }
  const text = data.toString('utf8').replace(/^﻿/, '')
  if (!text.trim()) return { ok: false, error: 'The file is empty: it has no classes in it.' }
  if (text.includes('�')) {
    return {
      ok: false,
      error: `This file is not UTF-8, so its accented letters cannot be read. ${SAVE_AS_CSV}`,
    }
  }

  let records: string[][]
  try {
    records = parse(text, {
      relax_column_count: true,
      relax_quotes: true,
      record_delimiter: ['\r\n', '\n', '\r'],
      skip_empty_lines: false,
    }) as string[][]
  } catch (error) {
    return { ok: false, error: parseErrorMessage(error) }
  }

  const header = (records.shift() ?? []).map((cell) => cell.replace(/\p{Cf}/gu, '').trim())
  const headerError = checkHeader(header)
  if (headerError) return { ok: false, error: headerError }

  const rows: string[][] = []
  for (const [index, record] of records.entries()) {
    const line = index + 2
    if (record.every((cell) => !cell.trim()) || isTemplateHelpRow(record)) continue
    if (record.slice(header.length).some((cell) => cell.trim())) {
      return {
        ok: false,
        error: `Line ${line} has ${record.length} values but the header has ${header.length} columns. A value that contains a comma must be wrapped in double quotes.`,
      }
    }
    rows.push([String(line), ...header.map((_, at) => record[at] ?? '')])
  }

  if (!rows.length) return { ok: false, error: 'The file has a header but no classes in it.' }
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      error: `The file has ${rows.length} classes; the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.`,
    }
  }
  return { ok: true, csv: stringify([[LINE_COLUMN, ...header], ...rows]), rows: rows.length }
}

/**
 * Why the header cannot be used, or null.
 *
 * ⚠ **An unrecognised header is a refusal, not an ignored column.** A
 * misspelled `titel` would otherwise drop every title in the file silently.
 * A header starting with `#` is the one exception: the skipped-rows file's
 * `#error` column, which is meant to come back with the fixed rows.
 */
export function checkHeader(names: readonly string[]): string | null {
  const named = names.filter(Boolean)
  const unknown = named.filter((name) => !name.startsWith('#') && !isImportColumn(name))
  if (unknown.length) {
    const hint =
      named.length === 1
        ? ' The header reads as a single column, so the file is probably not comma-separated.'
        : ' Download the template and use its header row.'
    return `Unrecognised column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.${hint}`
  }
  const duplicated = named.filter((name, at) => named.indexOf(name) !== at)
  if (duplicated.length) return `Duplicated column${duplicated.length > 1 ? 's' : ''}: ${duplicated.join(', ')}.`
  const missing = requiredColumnsFor(undefined).filter((name) => !named.includes(name))
  if (missing.length) {
    return `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`
  }
  return null
}

function isUtf16(data: Buffer): boolean {
  if (data.length >= 2 && ((data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff))) {
    return true
  }
  return data.subarray(0, 512).includes(0)
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof CsvError)) return 'The file could not be read as CSV.'
  const lines = (error as CsvError & { lines?: number }).lines
  const where = typeof lines === 'number' ? `Line ${lines}` : 'A line'
  if (error.code === 'CSV_QUOTE_NOT_CLOSED') {
    return `${where} opens a double quote (") that never closes, so the rest of the file reads as one value. Close the quote or remove it.`
  }
  return `${where} could not be read as CSV.`
}
