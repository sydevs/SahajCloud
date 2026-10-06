/**
 * The skipped lines a commit reports, as a CSV the volunteer fixes and uploads
 * again (#828).
 *
 * ⚠ **The round trip is the property worth pinning.** The file goes back
 * through the same parser, so its header has to be one the parser accepts as it
 * stands — the template's columns, plus a `#`-prefixed one it ignores.
 */

import { describe, expect, it } from 'vitest'

import { SKIPPED_REASON_COLUMN, skippedRowsCsv } from '@/collections/EventImports/commit/skippedCsv'
import { IMPORT_COLUMNS } from '@/collections/EventImports/csv/columns'
import { parseImportCsv } from '@/collections/EventImports/csv/parse'

describe('skippedRowsCsv', () => {
  it('writes the template’s columns, then the reasons, under a BOM', () => {
    const csv = skippedRowsCsv([
      { line: 7, reasons: ['website: bad', 'a repeat of line 2'], values: { title: 'Tuesday' } },
    ])

    expect(csv.startsWith('﻿')).toBe(true)
    const [header, first] = csv.slice(1).split('\r\n')
    expect(header).toBe([...IMPORT_COLUMNS.map(({ name }) => name), SKIPPED_REASON_COLUMN].join(','))
    expect(first?.startsWith('Tuesday,')).toBe(true)
    expect(first?.endsWith('line 7: website: bad; a repeat of line 2')).toBe(true)
  })

  it('quotes a value holding a comma, a quote or a line break', () => {
    const csv = skippedRowsCsv([
      { line: 2, reasons: ['x'], values: { title: 'A, "B"', description: 'one\ntwo' } },
    ])

    expect(csv).toContain('"A, ""B"""')
    expect(csv).toContain('"one\ntwo"')
  })

  /** What the volunteer actually does with it: open, fix, upload. */
  it('parses back through the upload with the reasons column ignored', () => {
    const values = Object.fromEntries(
      IMPORT_COLUMNS.map(({ example, name }) => [name, example ?? '']),
    )
    const csv = skippedRowsCsv([{ line: 9, reasons: ['website: bad'], values }])

    const parsed = parseImportCsv(csv)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.values).not.toHaveProperty(SKIPPED_REASON_COLUMN)
  })
})
