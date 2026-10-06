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
import type { ProposedRowError as TreeRowError } from '@/collections/EventImports/propose/tree'
import {
  reviewEmails,
  reviewRows,
  type AccountVerdict,
} from '@/collections/EventImports/review/rows'

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
  return { line, values: { title: `Class ${line}`, city: 'Berlin' }, resolved: resolved(), ...over }
}

const review = (
  rows: CommitRow[],
  known: Record<string, AccountVerdict> = {},
  treeRowErrors: TreeRowError[] = [],
) => reviewRows({ rows, accounts: new Map(Object.entries(known)), treeRowErrors })

describe('reviewRows', () => {
  it('reads a clean row as ready, with nobody vouching for it', () => {
    const { rows, coordinators } = review([row(2)])

    expect(rows).toEqual([
      {
        line: 2,
        status: 'ready',
        title: 'Class 2',
        place: 'Berlin',
        reasons: [],
        warnings: [],
        coordinator: 'none',
        duplicate: null,
      },
    ])
    expect(coordinators).toEqual({ existing: 0, created: 0, unlinked: 0 })
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

      expect(coordinators).toEqual({ existing: 0, created: 1, unlinked: 0 })
      expect(rows.map((reviewed) => reviewed.coordinator)).toEqual(['new', 'new', 'new'])
    })

    it('counts an address whose account the commit links as existing', () => {
      const { rows, coordinators } = review(
        [
          row(2, { values: { managerEmail: 'held@example.org' } }),
          row(3, { values: { managerEmail: 'fresh@example.org' } }),
        ],
        { 'held@example.org': 'linkable' },
      )

      expect(coordinators).toEqual({ existing: 1, created: 1, unlinked: 0 })
      expect(rows.map((reviewed) => reviewed.coordinator)).toEqual(['existing', 'new'])
    })

    /**
     * An admin's address, a deactivated account, a coordinator elsewhere: the
     * commit imports their classes with no coordinator, so the review must say
     * so rather than promise a link.
     */
    it('calls an account the commit may not link unlinked, and opens nothing for it', () => {
      const { rows, coordinators } = review(
        [row(2, { values: { managerEmail: 'admin@example.org' } })],
        { 'admin@example.org': 'unlinkable' },
      )

      expect(coordinators).toEqual({ existing: 0, created: 0, unlinked: 1 })
      expect(rows[0]!.coordinator).toBe('unlinked')
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

      expect(coordinators).toEqual({ existing: 0, created: 0, unlinked: 0 })
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
      expect(rows[0]!.reasons).toEqual(['timezone is not one we support', 'a repeat of class #77'])
    })

    // ⚠ **No `errors` on the fixture, deliberately.** With one, this would pass
    // through the error branch and prove nothing about `resolved` — which is how
    // the first version of this case could not fail for the reason it named.
    // Unreachable today (a batch cannot be proposed until every row has an
    // answer), and still not `ready`.
    it('reports a row with no answer and no reason as pending', () => {
      const { rows } = review([row(2, { resolved: undefined })])

      expect(rows[0]!.status).toBe('pending')
    })

    // ⚠ The commit writes 20 rows per request and the review stays readable while
    // it runs, so a resumed batch is full of these. `ready` would send a
    // volunteer looking for what went wrong with a class that already exists.
    it('offers a decision on each duplicate, overwrite only against an existing class', () => {
      const { rows } = review([
        row(2, { duplicate: { reason: 'city-and-time', strength: 'weak', eventId: 77 } }),
        row(3, { duplicate: { reason: 'nearby-address', line: 2 } }),
      ])

      expect(rows.map((reviewed) => reviewed.duplicate)).toEqual([
        { strength: 'weak', eventId: 77, action: 'skip', overwritable: true },
        { strength: 'strong', line: 2, action: 'skip', overwritable: false },
      ])
    })

    it('reads a duplicate the reviewer chose to import as ready, with nothing skipped', () => {
      const { rows } = review([
        row(2, { duplicate: { reason: 'nearby-address', eventId: 77, action: 'import' } }),
      ])

      expect(rows[0]).toMatchObject({ status: 'ready', reasons: [] })
      expect(rows[0]!.duplicate?.action).toBe('import')
    })

    it('carries a row’s warnings beside its reasons', () => {
      const { rows } = review([row(2, { warnings: ['only found the town'] })])

      expect(rows[0]).toMatchObject({ status: 'ready', warnings: ['only found the town'] })
    })

    it('reports an already-created row as committed, not ready', () => {
      const { rows } = review([row(2, { committed: { eventId: 931 } })])

      expect(rows[0]!.status).toBe('committed')
      expect(rows[0]!.reasons).toEqual([])
    })
  })
})

// ⚠ **The highest-value agreement in this file.** `adoptTreeErrors`
// (`endpoints/commit.ts`) folds the proposal's refusals onto the rows *before* the
// commit rosters anything, so a review that did not fold them would call a refused
// line ready, give no reason, and count an account the commit never opens — the
// one number the volunteer is being asked to approve.
describe('a line the proposal refused', () => {
  const refusal = [{ line: 2, message: '"Pune" already exists outside this region of the Atlas' }]

  it('is skipped with the proposal’s own reason, not reported ready', () => {
    const { rows } = review([row(2), row(3)], {}, refusal)

    expect(rows[0]).toMatchObject({
      line: 2,
      status: 'error',
      reasons: refusal[0]!.message ? [refusal[0]!.message] : [],
    })
    expect(rows[1]).toMatchObject({ line: 3, status: 'ready', reasons: [] })
  })

  it('opens no account, however new its coordinator', () => {
    const { coordinators, rows } = review(
      [row(2, { values: { managerEmail: 'fresh@example.org' } })],
      {},
      refusal,
    )

    expect(coordinators).toEqual({ existing: 0, created: 0, unlinked: 0 })
    // The row still names who it would have brought, because that is a fact
    // about the line the volunteer is about to fix.
    expect(rows[0]!.coordinator).toBe('new')
  })

  it('reports its own error and the proposal’s, in that order', () => {
    const { rows } = review([row(2, { errors: ['no city'] })], {}, refusal)

    expect(rows[0]!.reasons).toEqual(['no city', refusal[0]!.message])
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

  /**
   * ⚠ **An errored row's address is never asked about.** Asked of every row, a
   * batch of rows that each fail the parse tests 500 addresses for whether they
   * hold an account, for four requests and no geocoding. A duplicate the
   * reviewer may still import resolved, so its address is asked.
   */
  it('asks about a resolved duplicate’s address, never an errored row’s', () => {
    const emails = reviewEmails([
      row(2, { values: { managerEmail: 'errored@example.org' }, errors: ['no city'] }),
      row(3, {
        values: { managerEmail: 'repeated@example.org' },
        duplicate: { reason: 'nearby-address', line: 2 },
      }),
      row(4, { values: { managerEmail: 'unresolved@example.org' }, resolved: undefined }),
    ])

    expect(emails).toEqual(['repeated@example.org'])
  })
})
