import { parse } from 'csv-parse/sync'
import { describe, expect, it } from 'vitest'

import { MAX_IMPORT_ROWS } from '@/plugins/eventImport/constants'
import { IMPORT_COLUMNS } from '@/plugins/eventImport/csv/columns'
import { buildImportTemplate } from '@/plugins/eventImport/csv/template'
import { LINE_COLUMN, prepareUpload } from '@/plugins/eventImport/csv/upload'

const HEADER = IMPORT_COLUMNS.map(({ name }) => name)

const line = (title: string) => HEADER.map((name) => (name === 'title' ? title : 'x')).join(',')
const csv = (...lines: string[]) => Buffer.from([HEADER.join(','), ...lines].join('\n'), 'utf8')

function cleaned(data: Buffer, name = 'classes.csv') {
  const result = prepareUpload(name, data)
  if (!result.ok) throw new Error(`expected a clean file, got: ${result.error}`)
  return parse(result.csv, { columns: true }) as Record<string, string>[]
}

function refusal(data: Buffer, name = 'classes.csv') {
  const result = prepareUpload(name, data)
  if (result.ok) throw new Error('expected a refusal')
  return result.error
}

describe('prepareUpload', () => {
  it('drops blank rows and keeps each row’s spreadsheet line', () => {
    const rows = cleaned(csv(line('A'), HEADER.map(() => '').join(','), '', line('B')))
    expect(rows.map((row) => [row[LINE_COLUMN], row.title])).toEqual([
      ['2', 'A'],
      ['5', 'B'],
    ])
  })

  it('drops the template’s help row, and keeps its example for the row checks to refuse', () => {
    const rows = cleaned(Buffer.from(buildImportTemplate(), 'utf8'))
    expect(rows).toHaveLength(1)
    expect(rows[0]![LINE_COLUMN]).toBe('3')
  })

  it('reads a header cell carrying an invisible character', () => {
    const data = Buffer.from([HEADER.join(',').replace('title', 'title​'), line('A')].join('\n'))
    expect(cleaned(data)[0]!.title).toBe('A')
  })

  it('pads a row a spreadsheet saved without its trailing empty cells', () => {
    const short = line('Short').split(',').slice(0, 5).join(',')
    expect(cleaned(csv(short))[0]).toMatchObject({ title: 'Short', untilDate: '' })
  })

  it('keeps a quoted comma and line break inside one value', () => {
    const quoted = line('Q').replace(/^Q/, '"Q, with comma\nand a line"')
    expect(cleaned(csv(quoted))[0]!.title).toBe('Q, with comma\nand a line')
  })

  it('strips a byte-order mark and reads CRLF line endings', () => {
    const data = Buffer.from(`﻿${[HEADER.join(','), line('A')].join('\r\n')}\r\n`, 'utf8')
    expect(cleaned(data)[0]!.title).toBe('A')
  })

  it.each([
    ['a file that is not .csv', 'classes.xlsx', csv(line('A')), /Upload a CSV file/],
    ['a UTF-16 file', 'classes.csv', Buffer.from([0xff, 0xfe, 0x74, 0x00]), /UTF-16/],
    [
      'a file that is not UTF-8',
      'classes.csv',
      Buffer.concat([csv(line('M')), Buffer.from([0xfc])]),
      /not UTF-8/,
    ],
    ['an empty file', 'classes.csv', Buffer.from(''), /no classes/],
    ['a header with no rows', 'classes.csv', csv(), /no classes/],
    [
      'an unknown column',
      'classes.csv',
      Buffer.from(`${HEADER.join(',')},notes\n${line('A')},x`),
      /Unrecognised column: notes/,
    ],
    [
      'a missing column',
      'classes.csv',
      Buffer.from(HEADER.filter((n) => n !== 'city').join(',')),
      /Missing required column: city/,
    ],
    [
      'a duplicated column',
      'classes.csv',
      Buffer.from(`${HEADER.join(',')},title`),
      /Duplicated column: title/,
    ],
    [
      'a semicolon-separated file',
      'classes.csv',
      Buffer.from(HEADER.join(';')),
      /not comma-separated/,
    ],
    ['an unclosed quote', 'classes.csv', csv(`"${line('A')}`), /never closes/],
  ])('refuses %s', (_, name, data, message) => {
    expect(refusal(data, name)).toMatch(message)
  })

  it('names the line of a value split on an unquoted comma', () => {
    expect(refusal(csv(line('A'), `${line('B')},spill`))).toMatch(
      /^Line 3 has 28 values but the header has 27 columns/,
    )
  })

  it('refuses a file over the row limit, counting real rows only', () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, at) => line(`R${at}`))
    expect(refusal(csv(...rows))).toMatch(`limit is ${MAX_IMPORT_ROWS}`)
    expect(prepareUpload('classes.csv', csv(...rows.slice(1), '', ',,,')).ok).toBe(true)
  })
})
