import { describe, expect, it } from 'vitest'

import { MAX_IMPORT_ROWS } from '@/collections/EventImports/constants'
import { IMPORT_COLUMNS } from '@/collections/EventImports/csv/columns'
import { parseImportCsv } from '@/collections/EventImports/csv/parse'
import {
  IMPORT_TEMPLATE_FILENAME,
  buildImportTemplate,
} from '@/collections/EventImports/csv/template'

/** A minimal valid file: only the columns every row owes, plus the offline pair. */
const HEADER = 'title,eventType,country,city,address,scheduleType'
const OFFLINE = 'Tuesday Meditation,offline,DE,Berlin,Oranienstraße 25,weekly'

function rows(csv: string) {
  const result = parseImportCsv(csv)
  if (!result.ok) throw new Error(`expected rows, got refusal: ${result.error}`)
  return result.rows
}

function refusal(csv: string): string {
  const result = parseImportCsv(csv)
  if (result.ok) throw new Error('expected a refusal, got rows')
  return result.error
}

describe('parseImportCsv — the file', () => {
  it('reads a well-formed file', () => {
    const parsed = rows(`${HEADER}\n${OFFLINE}`)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ line: 2, errors: [] })
    expect(parsed[0]!.values.title).toBe('Tuesday Meditation')
  })

  it('refuses an empty file', () => {
    expect(refusal('')).toBe('The file is empty.')
  })

  it('refuses a header with no data rows', () => {
    expect(refusal(HEADER)).toBe('The file has a header but no data rows.')
  })

  it('refuses an unrecognised column by name', () => {
    expect(refusal(`${HEADER},titel\n${OFFLINE},x`)).toBe(
      'Unrecognised column: titel. Download the template and use its header row.',
    )
  })

  it('refuses a duplicated column', () => {
    expect(refusal(`${HEADER},title\n${OFFLINE},again`)).toBe('Duplicated column: title.')
  })

  it('refuses a file missing an always-required column', () => {
    expect(refusal(`title,eventType,city,address,scheduleType\n${OFFLINE}`)).toBe(
      'Missing required column: country.',
    )
  })

  it('drops a trailing blank header column, which is what a spreadsheet export adds', () => {
    expect(rows(`${HEADER},\n${OFFLINE},`)).toHaveLength(1)
  })

  it('strips a UTF-8 BOM rather than reading it into the first header', () => {
    expect(rows(`﻿${HEADER}\n${OFFLINE}`)).toHaveLength(1)
  })

  it('reads a quoted value containing the delimiter', () => {
    const parsed = rows(`${HEADER}\n"Meditation, Beginners",offline,DE,Berlin,Oranienstraße 25,weekly`)
    expect(parsed[0]!.values.title).toBe('Meditation, Beginners')
  })
})

describe('parseImportCsv — the row cap', () => {
  function fileWith(count: number): string {
    return [HEADER, ...Array.from({ length: count }, () => OFFLINE)].join('\n')
  }

  it(`accepts exactly ${MAX_IMPORT_ROWS} data rows`, () => {
    expect(rows(fileWith(MAX_IMPORT_ROWS))).toHaveLength(MAX_IMPORT_ROWS)
  })

  it('refuses one row over the cap, and says how many it saw', () => {
    expect(refusal(fileWith(MAX_IMPORT_ROWS + 1))).toBe(
      `The file has ${MAX_IMPORT_ROWS + 1} data rows; the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.`,
    )
  })

  it('counts neither the help row nor blank rows against the cap', () => {
    const padded = [HEADER, '# instructions', ...Array(MAX_IMPORT_ROWS).fill(OFFLINE), '', ''].join(
      '\n',
    )
    expect(rows(padded)).toHaveLength(MAX_IMPORT_ROWS)
  })
})

describe('parseImportCsv — line numbers', () => {
  it('numbers a row by its line in the file, counting the header', () => {
    const parsed = rows(`${HEADER}\n${OFFLINE}\n${OFFLINE}`)
    expect(parsed.map(({ line }) => line)).toEqual([2, 3])
  })

  it('keeps the numbering true across a skipped help row and a blank line', () => {
    // A volunteer navigates to the line their spreadsheet shows, so a skipped
    // row must still advance the count.
    const parsed = rows(`${HEADER}\n# instructions\n\n${OFFLINE}`)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.line).toBe(4)
  })
})

describe('parseImportCsv — per-row requirements', () => {
  it('requires the offline pair on an offline row', () => {
    const parsed = rows(`${HEADER}\nTuesday,offline,DE,,,weekly`)
    expect(parsed[0]!.errors).toEqual(['city is required', 'address is required'])
  })

  it('requires onlineUrl on an online row, and not the address', () => {
    const parsed = rows(`title,eventType,country,onlineUrl,scheduleType\nZoom Class,online,DE,,weekly`)
    expect(parsed[0]!.errors).toEqual(['onlineUrl is required'])
  })

  it('does not ask an online row for an address column the file omits', () => {
    const parsed = rows(
      `title,eventType,country,onlineUrl,scheduleType\nZoom Class,online,DE,https://example.org/z,weekly`,
    )
    expect(parsed[0]!.errors).toEqual([])
  })

  it('reports a missing eventType once, without deriving location errors from it', () => {
    const parsed = rows(`${HEADER}\nTuesday,,DE,,,weekly`)
    // Only `eventType` and the always-required columns are judged: which
    // location columns the row owed is unknowable until the type is fixed.
    expect(parsed[0]!.errors).toEqual(['eventType is required'])
  })

  it('names an unsupported eventType', () => {
    const parsed = rows(`${HEADER}\nTuesday,hybrid,DE,Berlin,Street 1,weekly`)
    expect(parsed[0]!.errors).toEqual(['eventType must be offline or online (got "hybrid")'])
  })

  it('lowercases the eventType it accepts', () => {
    const parsed = rows(`${HEADER}\nTuesday,Offline,DE,Berlin,Street 1,weekly`)
    expect(parsed[0]!.errors).toEqual([])
    expect(parsed[0]!.values.eventType).toBe('offline')
  })

  it('refuses a row with more values than the header has columns', () => {
    // An unquoted comma in the address shifts every later value one column
    // left and drops the last. `relaxColumnCount` keeps the parse alive, so
    // without this the row reads as a bad `scheduleType` and the volunteer is
    // pointed at the wrong column.
    const parsed = rows(`${HEADER}\nT Class,offline,DE,Berlin,Main St, 25,weekly`)
    expect(parsed[0]!.errors).toContain(
      'this row has 7 values but the header has 6 columns — check for an unquoted comma',
    )
  })

  it('accepts the same row once the comma is quoted', () => {
    const parsed = rows(`${HEADER}\nT Class,offline,DE,Berlin,"Main St, 25",weekly`)
    expect(parsed[0]!.errors).toEqual([])
    expect(parsed[0]!.values.address).toBe('Main St, 25')
  })

  it('does not count trailing empty cells as extra values', () => {
    expect(rows(`${HEADER}\n${OFFLINE},,`)[0]!.errors).toEqual([])
  })

  it('treats a whitespace-only cell as missing', () => {
    const parsed = rows(`${HEADER}\n   ,offline,DE,Berlin,Street 1,weekly`)
    expect(parsed[0]!.errors).toEqual(['title is required'])
  })
})

describe('buildImportTemplate', () => {
  it('parses through the real parser with no row errors', () => {
    // ⚠ The whole reason the column spec is one constant: a template the parser
    // refuses is the failure this asserts away.
    const parsed = rows(buildImportTemplate())
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.errors).toEqual([])
  })

  it('writes every column, in spec order', () => {
    expect(buildImportTemplate().split('\n')[0]).toBe(
      IMPORT_COLUMNS.map(({ name }) => name).join(','),
    )
  })

  it('comments the help row so the parser skips it', () => {
    const [, help] = buildImportTemplate().split('\n')
    expect(help?.startsWith('# ')).toBe(true)
    expect(help).toContain('REQUIRED.')
  })

  it('quotes a help string containing the delimiter', () => {
    // `languages` help names a comma-separated example, so it must come back
    // as one field rather than splitting the row.
    const help = buildImportTemplate().split('\n')[1]!
    expect(help).toContain('"')
  })

  it('names the file with a .csv extension', () => {
    expect(IMPORT_TEMPLATE_FILENAME.endsWith('.csv')).toBe(true)
  })
})
