/**
 * Which rows a commit still owes, and the provenance entry each one leaves
 * (#828, phase 6b).
 *
 * The questions here are the ones resumption rests on, and none of them needs a
 * database: a chunk that re-offers a committed row creates a second class for
 * it, and a provenance entry appended twice is a log nobody can read.
 */
import { describe, expect, it } from 'vitest'

import {
  importLogEntry,
  isCommittable,
  refuseRow,
  rowsAwaitingCommit,
  type CommitRow,
} from '@/collections/EventImports/commit/rows'

function row(line: number, overrides: Partial<CommitRow> = {}): CommitRow {
  return {
    line,
    values: { title: `Class ${line}` },
    resolved: {
      latitude: 18.5,
      longitude: 73.8,
      timezone: 'Asia/Kolkata',
      cityKey: 'pune',
      placeName: 'Pune',
      placeId: 'place.pune',
      mapboxId: 'address.1',
      subdivisionCode: 'MH',
      weekdayMask: 0b10,
      startMinutes: 1110,
      languages: ['en'],
      inactive: false,
      anchorDate: '2026-09-28',
    },
    ...overrides,
  }
}

describe('isCommittable', () => {
  it('accepts a row that resolved cleanly', () => {
    expect(isCommittable(row(2))).toBe(true)
  })

  it('refuses a row with no answer, an error, or a match', () => {
    expect(isCommittable({ line: 2, values: {} })).toBe(false)
    expect(isCommittable(row(2, { errors: ['could not find this location'] }))).toBe(false)
    expect(isCommittable(row(2, { duplicate: { reason: 'city-and-time', line: 3 } }))).toBe(false)
  })
})

describe('rowsAwaitingCommit', () => {
  it('offers every committable row the first time', () => {
    expect(rowsAwaitingCommit([row(2), row(3), row(4)]).map(({ line }) => line)).toEqual([2, 3, 4])
  })

  /**
   * ⚠ **The assertion resumption rests on.** A committed row offered again is a
   * second class for one CSV line, and nothing downstream would call it a
   * duplicate — the batch's own rows are not re-read by the duplicate matcher.
   */
  it('never offers a row that already created a class', () => {
    const rows = [row(2, { committed: { eventId: 91 } }), row(3)]

    expect(rowsAwaitingCommit(rows).map(({ line }) => line)).toEqual([3])
  })

  it('stops offering a row the commit itself refused', () => {
    const refused = row(2)
    refuseRow(refused, 'Pune was not created')

    expect(rowsAwaitingCommit([refused, row(3)]).map(({ line }) => line)).toEqual([3])
  })

  it('keeps the errors a row already carried', () => {
    const existing = row(2, { errors: ['startTime is required'] })
    refuseRow(existing, 'and the region is gone')

    expect(existing.errors).toEqual(['startTime is required', 'and the region is gone'])
  })
})

describe('importLogEntry', () => {
  it('names the uploader and the line it came from', () => {
    const entry = importLogEntry({
      batchId: 12,
      line: 4,
      uploaderName: 'Anna Volunteer',
      at: '2026-09-28T09:00:00.000Z',
    })

    expect(entry).toMatchObject({
      at: '2026-09-28T09:00:00.000Z',
      type: 'event-import',
      key: '12:4',
      cells: { activity: 'Imported', who: 'Anna Volunteer', delivery: 'Bulk import, CSV line 4' },
    })
  })

  /**
   * ⚠ **Two batches, one line number.** `logField` asks a writer for an
   * exactly-once key, so two imports of line 4 must not read as one entry.
   */
  it('keys two batches apart on the same line', () => {
    const at = '2026-09-28T09:00:00.000Z'
    const first = importLogEntry({ batchId: 12, line: 4, uploaderName: 'A', at })
    const second = importLogEntry({ batchId: 13, line: 4, uploaderName: 'A', at })

    expect(first.key).not.toBe(second.key)
  })
})
