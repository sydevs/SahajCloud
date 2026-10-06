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
  importKeyFor,
  importLogEntry,
  isCommittable,
  refuseRow,
  reviveOrphanedRepeats,
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

describe('isCommittable — a duplicate', () => {
  it('skips one nobody decided on, and writes one the reviewer chose to import or overwrite', () => {
    const duplicate = { reason: 'nearby-address' as const, eventId: 5 }
    expect(isCommittable(row(2, { duplicate }))).toBe(false)
    expect(isCommittable(row(2, { duplicate: { ...duplicate, action: 'skip' } }))).toBe(false)
    expect(isCommittable(row(2, { duplicate: { ...duplicate, action: 'import' } }))).toBe(true)
    expect(isCommittable(row(2, { duplicate: { ...duplicate, action: 'overwrite' } }))).toBe(true)
  })
})

describe('reviveOrphanedRepeats', () => {
  /**
   * A file's second copy of a class is skipped for its first. If the first then
   * fails at commit, skipping the second too would import neither.
   */
  it('gives a skipped repeat back its chance when the line it repeats failed', () => {
    const rows = [
      row(2, { errors: ['website: bad'] }),
      row(3, { duplicate: { reason: 'nearby-address', line: 2 } }),
      row(4, { duplicate: { reason: 'nearby-address', line: 2, action: 'import' } }),
    ]
    reviveOrphanedRepeats(rows)
    expect(rows[1]?.duplicate).toBeUndefined()
    expect(isCommittable(rows[1]!)).toBe(true)
    // A choice the reviewer made is theirs, and is left alone.
    expect(rows[2]?.duplicate?.action).toBe('import')
  })

  it('leaves a repeat of a line that was imported', () => {
    const rows = [
      row(2, { committed: { eventId: 1 } }),
      row(3, { duplicate: { reason: 'nearby-address', line: 2 } }),
    ]
    reviveOrphanedRepeats(rows)
    expect(rows[1]?.duplicate).toBeDefined()
  })
})

describe('importKeyFor', () => {
  it('is the batch and the line, so two batches never share one', () => {
    expect(importKeyFor(12, 4)).toBe('12:4')
    expect(importKeyFor(12, 4)).not.toBe(importKeyFor(124, 4))
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
      uploader: { id: 7, name: 'Anna Volunteer' },
      at: '2026-09-28T09:00:00.000Z',
    })

    expect(entry).toMatchObject({
      at: '2026-09-28T09:00:00.000Z',
      type: 'event-import',
      key: '12:4',
      uploaderId: 7,
      cells: {
        activity: 'Imported',
        who: 'Anna Volunteer (#7)',
        delivery: 'Bulk import, CSV line 4',
      },
    })
  })

  /**
   * A manager's name is theirs to edit, so a name alone could credit anybody —
   * the id travels beside it, in the cell and as machine data.
   */
  it('says an overwrite is one, and keeps the uploader id even under a borrowed name', () => {
    const entry = importLogEntry({
      batchId: 12,
      line: 4,
      uploader: { id: 7, name: 'Jane Admin' },
      at: '2026-09-28T09:00:00.000Z',
      overwrote: true,
    })
    expect(entry.cells).toMatchObject({ activity: 'Overwritten by import', who: 'Jane Admin (#7)' })
    expect(entry.uploaderId).toBe(7)
  })

  /**
   * ⚠ **Two batches, one line number.** `logField` asks a writer for an
   * exactly-once key, so two imports of line 4 must not read as one entry.
   */
  it('keys two batches apart on the same line', () => {
    const at = '2026-09-28T09:00:00.000Z'
    const first = importLogEntry({ batchId: 12, line: 4, uploader: { id: 1, name: 'A' }, at })
    const second = importLogEntry({ batchId: 13, line: 4, uploader: { id: 1, name: 'A' }, at })

    expect(first.key).not.toBe(second.key)
  })
})
