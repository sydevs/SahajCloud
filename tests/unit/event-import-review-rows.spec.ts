/**
 * What the review table shows, and the one number its banner carries (#828).
 *
 * The table itself is presentation, but two of its decisions are not, and both
 * are wrong in a way nobody would notice from the screen:
 *
 * - **The coordinator banner counts accounts, not rows.** It is the only warning
 *   a volunteer gets that a CSV is about to open accounts, so a count that reads
 *   per row — or that counts a skipped row's coordinator — misstates the one
 *   thing they are being asked to approve.
 * - **The row's two verdicts answer different questions.** A ready row can also
 *   be about to create an account, so folding the skip decision and the vouching
 *   decision into one field hides whichever is second.
 *
 * Both are pinned against `isCommittable` and `managerRoster`'s own rules rather
 * than restated, because the commit reads those and this has to agree with it.
 */

import { describe, expect, it } from 'vitest'

import type { CommitRow } from '@/collections/EventImports/commit/rows'
import { reviewEmails, reviewRows } from '@/collections/EventImports/review/rows'

const ANCHOR = '2026-10-06'

/** The resolve step's answer, which is what makes a row committable. */
const resolved = (over: Partial<NonNullable<CommitRow['resolved']>> = {}) => ({
  latitude: 52.52,
  longitude: 13.405,
  timezone: 'Europe/Berlin',
  cityKey: 'berlin',
  placeName: 'Berlin',
  placeId: 'place.berlin',
  mapboxId: null,
  subdivisionCode: 'BE',
  weekdayMask: 0b10,
  startMinutes: 1110,
  languages: ['de'],
  inactive: false,
  anchorDate: ANCHOR,
  ...over,
})

function row(line: number, over: Partial<CommitRow> = {}): CommitRow {
  return {
    line,
    values: { title: `Class ${line}`, city: 'Berlin', ...over.values },
    resolved: resolved(),
    ...over,
  } as CommitRow
}

const review = (rows: CommitRow[], known: string[] = []) =>
  reviewRows({ rows, knownEmails: new Set(known) })

describe('reviewRows', () => {
  it('reads a clean row as ready, with nobody vouching for it', () => {
    const { rows, coordinators } = review([row(2)])

    expect(rows).toEqual([
      { line: 2, status: 'ready', title: 'Class 2', place: 'Berlin', reasons: [], coordinator: 'none' },
    ])
    expect(coordinators).toEqual({ existing: 0, created: 0 })
  })

  it('names the geocoded place, not the city the CSV typed', () => {
    const [berlin] = review([
      row(2, { values: { city: 'Berln' }, resolved: resolved({ placeName: 'Berlin' }) }),
    ]).rows

    expect(berlin!.place).toBe('Berlin')
  })

  // A row that never geocoded has only what its author typed, and a blank cell
  // beside "could not find this location" would read as a second fault.
  it('falls back to the typed city, then to nothing', () => {
    const { rows } = review([
      row(2, { resolved: undefined, errors: ['could not find this location'] }),
      row(3, { values: { city: '  ' }, resolved: undefined, errors: ['no city'] }),
    ])

    expect(rows.map((reviewed) => reviewed.place)).toEqual(['Berlin', null])
  })

  it('leaves a blank title null rather than empty', () => {
    const { rows } = review([row(2, { values: { title: '   ' } })])

    expect(rows[0]!.title).toBeNull()
  })

  describe('the coordinator banner', () => {
    it('counts one account for a dozen classes run by one new coordinator', () => {
      const { rows, coordinators } = review([
        row(2, { values: { managerEmail: 'anna@example.org' } }),
        row(3, { values: { managerEmail: 'Anna@Example.org' } }),
        row(4, { values: { managerEmail: 'anna@example.org' } }),
      ])

      expect(coordinators).toEqual({ existing: 0, created: 1 })
      expect(rows.map((reviewed) => reviewed.coordinator)).toEqual(['new', 'new', 'new'])
    })

    it('counts an address that already holds an account as existing', () => {
      const { rows, coordinators } = review(
        [
          row(2, { values: { managerEmail: 'held@example.org' } }),
          row(3, { values: { managerEmail: 'fresh@example.org' } }),
        ],
        ['held@example.org'],
      )

      expect(coordinators).toEqual({ existing: 1, created: 1 })
      expect(rows.map((reviewed) => reviewed.coordinator)).toEqual(['existing', 'new'])
    })

    // ⚠ The commit rosters only the committable rows, so counting a skipped
    // row's address would promise an account nothing opens.
    it('counts no account for an address only a skipped row names', () => {
      const { coordinators } = review([
        row(2, { values: { managerEmail: 'errored@example.org' }, errors: ['no city'] }),
        row(3, {
          values: { managerEmail: 'repeated@example.org' },
          duplicate: { reason: 'city-and-time', eventId: 77 },
        }),
      ])

      expect(coordinators).toEqual({ existing: 0, created: 0 })
    })

    // The row still says who it named: a volunteer fixing line 2 needs to know
    // the account arrives with it, and the banner is about the batch.
    it('still names a skipped row’s own coordinator', () => {
      const { rows } = review([
        row(2, { values: { managerEmail: 'errored@example.org' }, errors: ['no city'] }),
      ])

      expect(rows[0]!.coordinator).toBe('new')
    })
  })

  describe('why a row is skipped', () => {
    it('reports a duplicate in the words the commit will', () => {
      const { rows } = review([
        row(2, { duplicate: { reason: 'city-and-time', eventId: 77 } }),
        row(3, { duplicate: { reason: 'nearby-address', line: 2 } }),
        row(4, { duplicate: { reason: 'nearby-address' } }),
      ])

      expect(rows.map((reviewed) => [reviewed.status, reviewed.reasons])).toEqual([
        ['duplicate', ['a repeat of class #77']],
        ['duplicate', ['a repeat of line 2']],
        ['duplicate', ['a repeat of an existing class']],
      ])
    })

    // ⚠ A row carrying both is an error, the order `isCommittable` reads them
    // in: calling it a duplicate sends a volunteer looking for a class that was
    // never matched.
    it('calls a row carrying both an error, and still says what it repeats', () => {
      const { rows } = review([
        row(2, {
          errors: ['timezone is not one we support'],
          duplicate: { reason: 'city-and-time', eventId: 77 },
        }),
      ])

      expect(rows[0]!.status).toBe('error')
      expect(rows[0]!.reasons).toEqual([
        'timezone is not one we support',
        'a repeat of class #77',
      ])
    })

    // A pending row is not a skip the review can explain, and `isCommittable`
    // already refuses it — so it must not read as ready either.
    it('reports a row that never resolved as an error', () => {
      const { rows } = review([
        row(2, { resolved: undefined, errors: ['could not find this location'] }),
      ])

      expect(rows[0]!.status).toBe('error')
    })
  })
})

describe('reviewEmails', () => {
  it('asks about each committable address once, lowercased', () => {
    const emails = reviewEmails([
      row(2, { values: { managerEmail: ' Anna@Example.org ' } }),
      row(3, { values: { managerEmail: 'anna@example.org' } }),
      row(4, { values: { managerEmail: 'bo@example.org' } }),
      row(5),
    ])

    expect(emails).toEqual(['anna@example.org', 'bo@example.org'])
  })

  // The endpoint's read is `where email in [...]`, so a skipped row's address
  // here would ask `managers` about somebody the batch is not going to touch.
  it('asks nothing about an address only a skipped row names', () => {
    const emails = reviewEmails([
      row(2, { values: { managerEmail: 'errored@example.org' }, errors: ['no city'] }),
      row(3, {
        values: { managerEmail: 'repeated@example.org' },
        duplicate: { reason: 'nearby-address', line: 2 },
      }),
    ])

    expect(emails).toEqual([])
  })
})
