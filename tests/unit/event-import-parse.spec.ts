import { parse } from 'csv-parse/sync'
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

/** The template's own help row, exactly as a volunteer who left it in uploads it. */
const HELP_ROW = buildImportTemplate().split('\n')[1]!

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
    const padded = [HEADER, HELP_ROW, ...Array(MAX_IMPORT_ROWS).fill(OFFLINE), '', ''].join(
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
    const parsed = rows(`${HEADER}\n${HELP_ROW}\n\n${OFFLINE}`)
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
      'line 2 has 7 values but the header has 6 columns — a value containing a comma must be wrapped in double quotes',
    )
  })

  it('accepts the same row once the comma is quoted', () => {
    const parsed = rows(`${HEADER}\nT Class,offline,DE,Berlin,"Main St, 25",weekly`)
    expect(parsed[0]!.errors).toEqual([])
    expect(parsed[0]!.values.address).toBe('Main St, 25')
  })

  it('accepts trailing empty cells within the header width', () => {
    expect(rows(`${HEADER},,\n${OFFLINE},,`)[0]!.errors).toEqual([])
  })

  it('refuses a row whose overflow landed on a blank trailing cell', () => {
    // The unquoted comma pushes " all welcome" into `website` and the blank
    // website out past the header, so the last filled cell is still in range.
    const parsed = rows(
      `${HEADER},description,website\n${OFFLINE},A free class, all welcome,`,
    )
    expect(parsed[0]!.errors).toEqual([
      'line 2 has 9 values but the header has 8 columns — a value containing a comma must be wrapped in double quotes',
    ])
  })

  it('treats a whitespace-only cell as missing', () => {
    const parsed = rows(`${HEADER}\n   ,offline,DE,Berlin,Street 1,weekly`)
    expect(parsed[0]!.errors).toEqual(['title is required'])
  })
})

describe('buildImportTemplate', () => {
  it('parses through the real parser, its example row refused for being the example', () => {
    // ⚠ The whole reason the column spec is one constant: a template the parser
    // refuses is the failure this asserts away. The example is otherwise a valid
    // class, so the one error is the only thing between it and an import that
    // invites its made-up coordinator.
    const parsed = rows(buildImportTemplate())
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.line).toBe(3)
    expect(parsed[0]!.errors).toEqual([
      'this is the template\'s example row — delete it, or replace it with one of your classes (got title "Tuesday Evening Meditation")',
    ])
  })

  it('accepts the example row once one value is changed', () => {
    const [header, help, example] = buildImportTemplate().split('\n')
    const edited = example!.replace('Tuesday Evening Meditation', 'Thursday Meditation')
    expect(rows([header, help, edited].join('\n'))[0]!.errors).toEqual([])
  })

  it('starts with a UTF-8 byte-order mark, so Excel opens it as UTF-8', () => {
    expect(buildImportTemplate().startsWith('\uFEFF')).toBe(true)
  })

  it('writes every column, in spec order', () => {
    expect(buildImportTemplate().slice(1).split('\n')[0]).toBe(
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

describe('parseImportCsv — a hostile or runaway file stays cheap', () => {
  // Parsed in full before the row cap applies, each of these costs seconds of
  // CPU and gigabytes of heap for one request.
  it('refuses a million tiny rows before building them', () => {
    const started = performance.now()
    expect(refusal(`${HEADER}\n${'x\n'.repeat(999_000)}`)).toBe(
      `The file has more than ${MAX_IMPORT_ROWS} data rows; the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.`,
    )
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('reads two million bare newlines as an empty file, without parsing them', () => {
    const started = performance.now()
    expect(refusal('\n'.repeat(2_000_000))).toBe('The file is empty.')
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('refuses a flood of blank lines between two classes', () => {
    expect(refusal(`${HEADER}\n${OFFLINE}\n${'\n'.repeat(250_000)}${OFFLINE}`)).toBe(
      'The file has 250000 empty rows between its classes. Delete the empty rows and upload it again.',
    )
  })

  it('ignores the empty rows a spreadsheet exports below its data', () => {
    expect(rows(`${HEADER}\n${OFFLINE}\n${',,,,,\n'.repeat(15_000)}`)).toHaveLength(1)
  })
})

describe('parseImportCsv — encoding', () => {
  it('refuses a file that was not UTF-8, naming the line and the fix', () => {
    // What a Windows-1252 export of "München" looks like once the browser has
    // decoded it as UTF-8.
    const error = refusal(`${HEADER}\n${OFFLINE}\nKurs,offline,DE,M\uFFFDnchen,Str 1,weekly`)
    expect(error).toContain('This file is not UTF-8')
    expect(error).toContain('line 3 has one (got "Kurs,offline,DE,M\uFFFDnchen,Str 1,weekly")')
    expect(error).toContain('CSV UTF-8')
  })

  it('names UTF-16 when the text is full of NUL characters', () => {
    expect(refusal('t\u0000i\u0000t\u0000l\u0000e\u0000')).toContain('UTF-16')
  })
})

describe('parseImportCsv — delimiters and line endings', () => {
  it('reads a semicolon-separated file, as European Excel saves it', () => {
    const parsed = rows(
      'title;eventType;country;city;address;scheduleType\n"Kurs; Anfänger";offline;DE;Berlin;Str 1, Hof;weekly',
    )
    expect(parsed[0]!.values).toMatchObject({ title: 'Kurs; Anfänger', address: 'Str 1, Hof' })
    expect(parsed[0]!.errors).toEqual([])
  })

  it('reads a tab-separated file, as a copy out of Google Sheets is', () => {
    const parsed = rows(`${HEADER.replaceAll(',', '\t')}\n${OFFLINE.replaceAll(',', '\t')}`)
    expect(parsed[0]!.values.city).toBe('Berlin')
    expect(parsed[0]!.errors).toEqual([])
  })

  it('names the delimiter in the over-wide refusal', () => {
    const parsed = rows(`${HEADER.replaceAll(',', ';')}\n${OFFLINE.replaceAll(',', ';')};extra`)
    expect(parsed[0]!.errors[0]).toContain('a value containing a semicolon')
  })

  it('reads mixed CRLF, LF and CR endings as one row each', () => {
    const parsed = rows(`${HEADER}\r\n${OFFLINE}\n${OFFLINE}\r${OFFLINE}\r\n`)
    expect(parsed.map(({ line }) => line)).toEqual([2, 3, 4])
    expect(parsed.every(({ errors }) => errors.length === 0)).toBe(true)
  })
})

describe('parseImportCsv — quotes', () => {
  it('reads a quote inside an unquoted value as text', () => {
    const parsed = rows(`${HEADER}\nAnna "Annie" class,offline,DE,Berlin,Str 1,weekly`)
    expect(parsed[0]!.values.title).toBe('Anna "Annie" class')
  })

  it('opens a quote after the space a person types following the comma', () => {
    const parsed = rows(`${HEADER}\nKurs,offline,DE,Berlin, "Str 1, Hof",weekly`)
    expect(parsed[0]!.values.address).toBe('Str 1, Hof')
    expect(parsed[0]!.errors).toEqual([])
  })

  it('refuses an unclosed quote in plain words, naming the row it opened on', () => {
    expect(refusal(`${HEADER}\n${OFFLINE}\nKurs,offline,DE,"Berlin,Str 1,weekly\n${OFFLINE}`)).toBe(
      'Line 3 opens a double quote (") that never closes, so the rest of the file reads as one value. Close the quote, or remove it.',
    )
  })
})

describe('parseImportCsv — the header row', () => {
  it('refuses a column with no header that holds data', () => {
    expect(refusal(`title,eventType,,country,city,address,scheduleType\nKurs,offline,Mo/Di,DE,Berlin,Str 1,weekly`)).toBe(
      'Column C has no name in the header row, but line 2 has a value in it (got "Mo/Di"). Name the column as the template does, or delete it.',
    )
  })

  it('strips invisible format characters from a header name', () => {
    const parsed = rows(`\u200Btitle,eventType\u2060,country,city,address,scheduleType\n${OFFLINE}`)
    expect(parsed[0]!.values.title).toBe('Tuesday Meditation')
  })

  it('ignores a #-prefixed column and its values, as the skipped-rows file carries', () => {
    const parsed = rows(`${HEADER},#error\n${OFFLINE},"city is required, address is required"`)
    expect(parsed[0]!.errors).toEqual([])
    expect(parsed[0]!.values).not.toHaveProperty('#error')
  })

  it('suggests the delimiter when the whole header reads as one unknown column', () => {
    expect(refusal(`title|eventType|country\nx|y|z`)).toContain('may not be comma-separated')
  })
})

describe('parseImportCsv — the help row', () => {
  it('keeps a class whose title starts with #', () => {
    const parsed = rows(`${HEADER}\n#1 Beginners Class,offline,DE,Berlin,Str 1,weekly`)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.values.title).toBe('#1 Beginners Class')
  })

  it('keeps a row whose first cell is a #-numbered address', () => {
    const parsed = rows(
      `address,title,eventType,country,city,scheduleType\n#204-1234 Main St,Kurs,offline,CA,Vancouver,weekly`,
    )
    expect(parsed).toHaveLength(1)
  })

  /**
   * A volunteer's own note, commas and all. It names no `eventType` and no
   * `scheduleType`, which every class must, so it is a note and not a broken
   * class.
   */
  it('skips a #-comment row that fills no column a class must', () => {
    const parsed = rows(
      `${HEADER}
# Rows starting with # are notes, and so are blank lines.
${OFFLINE}`,
    )
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.line).toBe(3)
  })

  it('refuses a file whose only rows are notes as having no data', () => {
    expect(refusal(`${HEADER}
# only a note`)).toBe('The file has a header but no data rows.')
  })

  it('skips the template help row even with its columns reordered', () => {
    const [cells] = parse(HELP_ROW) as string[][]
    const quoted = cells!.map((cell) => `"${cell.replaceAll('"', '""')}"`)
    const reordered = [quoted[1], quoted[0], ...quoted.slice(2)].join(',')
    expect(rows(`${HEADER}\n${reordered}\n${OFFLINE}`)).toHaveLength(1)
  })
})

describe('parseImportCsv — value checks run at upload', () => {
  it('attaches field errors to the row, with its line', () => {
    const parsed = rows(`${HEADER},website,contactEmail\n${OFFLINE},www.example.org,mailto:a@example.org`)
    expect(parsed[0]!.errors).toEqual([
      'contactEmail must be the address alone, without "mailto:" (got "mailto:a@example.org")',
    ])
    expect(parsed[0]!.values.website).toBe('https://www.example.org')
    expect(parsed[0]!.warnings).toEqual([
      'website had no https:// — it will be published as "https://www.example.org" (got "www.example.org")',
    ])
  })

  it('leaves warnings off a clean row', () => {
    expect(rows(`${HEADER}\n${OFFLINE}`)[0]).not.toHaveProperty('warnings')
  })
})
