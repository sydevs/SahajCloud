/**
 * What a committed batch reports (#828, phase 6c).
 *
 * ⚠ **Every number here is recomputed from the rows, and that is the property
 * worth pinning.** The commit is chunked, so no counter survives it — a tally
 * that tracked instead of recomputing would report the last chunk's work as the
 * batch's.
 */

import { describe, expect, it } from 'vitest'

import { UNLINKED_COORDINATOR } from '@/collections/EventImports/commit/coordinators'
import type { CommitRow } from '@/collections/EventImports/commit/rows'
import { commitReport, tallyRows } from '@/collections/EventImports/commit/summary'

const resolved: CommitRow['resolved'] = {
  latitude: 52.52,
  longitude: 13.405,
  timezone: 'Europe/Berlin',
  cityKey: 'berlin',
  placeName: 'Berlin',
  placeId: 'place.berlin',
  mapboxId: 'address.1',
  subdivisionCode: 'BE',
  weekdayMask: 0b10,
  startMinutes: 1110,
  languages: ['de'],
  inactive: false,
  anchorDate: '2026-01-05',
}

function row(line: number, overrides: Partial<CommitRow> = {}): CommitRow {
  return { line, values: {}, resolved, ...overrides }
}

describe('tallyRows', () => {
  it('counts an overwritten class apart from the ones created', () => {
    const rows = [
      row(2, { values: { managerEmail: 'a@example.org' }, committed: { eventId: 11 } }),
      row(3, { committed: { eventId: 12, action: 'overwrote' } }),
    ]
    expect(tallyRows(rows)).toMatchObject({ committed: 2, overwritten: 1, verified: 1, unverified: 0 })
  })

  /**
   * A row naming an account the import may not link was imported without a
   * coordinator, so it is unverified whatever its CSV said.
   */
  it('counts a class whose coordinator could not be linked as unverified', () => {
    const rows = [
      row(2, {
        values: { managerEmail: 'admin@example.org' },
        warnings: [UNLINKED_COORDINATOR],
        committed: { eventId: 11 },
      }),
    ]
    expect(tallyRows(rows)).toMatchObject({ verified: 0, unverified: 1 })
  })

  it('splits committed classes by whether their row named a coordinator', () => {
    const rows = [
      row(2, { values: { managerEmail: 'a@example.org' }, committed: { eventId: 11 } }),
      row(3, { committed: { eventId: 12 } }),
      row(4, { values: { managerEmail: '   ' }, committed: { eventId: 13 } }),
    ]

    expect(tallyRows(rows)).toMatchObject({ committed: 3, verified: 1, unverified: 2 })
  })

  it('counts a skipped row under the reason it carries', () => {
    const rows = [
      row(2, { committed: { eventId: 11 } }),
      row(3, { errors: ['could not find this location'] }),
      row(4, { duplicate: { reason: 'city-and-time', line: 2 } }),
    ]

    expect(tallyRows(rows)).toEqual({
      total: 3,
      committed: 1,
      overwritten: 0,
      verified: 0,
      unverified: 1,
      duplicates: 1,
      errors: 1,
    })
  })

  it('counts nothing for an empty batch', () => {
    expect(tallyRows([])).toMatchObject({ total: 0, committed: 0, verified: 0, unverified: 0 })
  })
})

describe('commitReport', () => {
  it('names every class by the line it came from', () => {
    const rows = [row(2, { committed: { eventId: 11 } }), row(9, { committed: { eventId: 12 } })]

    expect(commitReport(rows).committed).toEqual([
      { line: 2, eventId: 11, action: 'created' },
      { line: 9, eventId: 12, action: 'created' },
    ])
  })

  it('carries every reason a line was skipped', () => {
    const rows = [
      row(2, { errors: ['no such timezone', 'and nothing to place it in'] }),
      row(3, { duplicate: { reason: 'city-and-time', line: 2 } }),
      row(4, { duplicate: { reason: 'nearby-address', eventId: 77 } }),
      row(5, { duplicate: { reason: 'nearby-address' } }),
    ]

    expect(commitReport(rows).skipped).toEqual([
      { line: 2, reasons: ['no such timezone', 'and nothing to place it in'], values: {} },
      { line: 3, reasons: ['a repeat of line 2'], values: {} },
      { line: 4, reasons: ['a repeat of class #77'], values: {} },
      { line: 5, reasons: ['a repeat of an existing class'], values: {} },
    ])
  })

  it('words a weak match and one found at commit apart from a plain repeat', () => {
    const rows = [
      row(2, { duplicate: { reason: 'city-and-time', strength: 'weak', eventId: 5 } }),
      row(3, { duplicate: { reason: 'nearby-address', eventId: 6, atCommit: true } }),
    ]

    expect(commitReport(rows).skipped.map(({ reasons }) => reasons)).toEqual([
      ['possibly a repeat of class #5'],
      ['a repeat of class #6, added after you reviewed this batch'],
    ])
  })

  /**
   * The skipped lines travel with their values, because the report is what the
   * volunteer downloads to fix and re-upload — the batch has lost them.
   */
  it('keeps the values of a skipped line and names how each committed line landed', () => {
    const rows = [
      row(2, { values: { title: 'Tuesday' }, errors: ['website: bad'] }),
      row(3, { committed: { eventId: 9, action: 'overwrote' } }),
      row(4, { committed: { eventId: 10 } }),
    ]

    const report = commitReport(rows)
    expect(report.skipped).toEqual([{ line: 2, reasons: ['website: bad'], values: { title: 'Tuesday' } }])
    expect(report.committed).toEqual([
      { line: 3, eventId: 9, action: 'overwrote' },
      { line: 4, eventId: 10, action: 'created' },
    ])
  })

  it('reports nothing about a duplicate the reviewer chose to import', () => {
    const imported = row(2, {
      duplicate: { reason: 'nearby-address', eventId: 5, action: 'import' },
    })
    expect(commitReport([imported]).skipped[0]?.reasons).toEqual([])
  })

  /**
   * A row with no answer and no complaint is still a line that got no class, and
   * the volunteer has to see it — an empty `reasons` is better than an absence.
   */
  it('reports a row that was never resolved, with nothing to say about it', () => {
    expect(commitReport([{ line: 2, values: {} }]).skipped).toEqual([
      { line: 2, reasons: [], values: {} },
    ])
  })
})
