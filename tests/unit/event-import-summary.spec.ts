/**
 * What a committed batch reports (#828, phase 6c).
 *
 * ⚠ **Every number here is recomputed from the rows, and that is the property
 * worth pinning.** The commit is chunked, so no counter survives it — a tally
 * that tracked instead of recomputing would report the last chunk's work as the
 * batch's.
 */

import { describe, expect, it } from 'vitest'

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
      { line: 2, eventId: 11 },
      { line: 9, eventId: 12 },
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
      { line: 2, reasons: ['no such timezone', 'and nothing to place it in'] },
      { line: 3, reasons: ['a repeat of line 2'] },
      { line: 4, reasons: ['a repeat of class #77'] },
      { line: 5, reasons: ['a repeat of an existing class'] },
    ])
  })

  /**
   * A row with no answer and no complaint is still a line that got no class, and
   * the volunteer has to see it — an empty `reasons` is better than an absence.
   */
  it('reports a row that was never resolved, with nothing to say about it', () => {
    expect(commitReport([{ line: 2, values: {} }]).skipped).toEqual([{ line: 2, reasons: [] }])
  })
})
