import { describe, expect, it } from 'vitest'

import type { OpenItemEvent, OpenItemRow } from '@/lib/atlasOverview/status'
import {
  openItem,
  openItemFilters,
  openItemStatus,
  overviewProgress,
  sortOpenItems,
} from '@/lib/atlasOverview/status'
import { OPEN_ITEM_STATUSES } from '@/lib/atlasOverview/filters'

const NOW = new Date('2026-11-05T12:00:00.000Z')

const event = (overrides: Partial<OpenItemEvent> = {}): OpenItemRow => ({
  createdAt: '2026-10-01T00:00:00.000Z',
  draft: false,
  hasManager: true,
  id: 1,
  kind: 'event',
  qualityOpenCount: 0,
  title: 'Tuesday Evening Meditation',
  updatedAt: '2026-11-01T00:00:00.000Z',
  verificationStage: 'verified',
  ...overrides,
})

const keysOf = (row: OpenItemRow) => openItemStatus(row, NOW).map((status) => status.key)
const only = (row: OpenItemRow) => openItemStatus(row, NOW)[0]!

describe('openItemStatus', () => {
  describe('every status in the table', () => {
    it('places an urgent listing ahead of everything, including a proposal', () => {
      const status = only(event({ verificationStage: 'urgent' }))
      expect(status).toMatchObject({
        filter: 'overdue',
        key: 'overdue',
        label: 'Overdue',
        pill: 'error',
        rank: 0,
        counts: true,
      })
      expect(status.line).toMatch(/^Unpublishes /)
      expect(status.action).toEqual({ label: 'Verify', target: { collection: 'events', id: 1 } })
    })

    /**
     * ⚠ Three stages, one thing to do. `urgent` is the last reminder before the
     * listing comes off the map, so it jumps the queue; `reminded` and
     * `escalated` are the same status one rank down.
     */
    it('gives reminded and escalated the same status at a lower rank', () => {
      for (const stage of ['reminded', 'escalated'] as const) {
        const status = only(event({ verificationStage: stage }))
        expect(status.key).toBe('overdue')
        expect(status.rank).toBe(2)
      }
    })

    it('names the changed fields on a change proposal', () => {
      const status = only(
        event({
          proposal: {
            changedFields: ['Address › City', 'Schedule › Start Time'],
            id: 42,
            receivedAt: '2026-11-03T00:00:00.000Z',
          },
        }),
      )
      expect(status).toMatchObject({
        filter: 'review',
        key: 'change-proposed',
        label: 'Change proposed',
        pill: 'success',
        rank: 1,
        counts: true,
      })
      expect(status.line).toBe('Address › City, Schedule › Start Time · received 3 Nov 2026')
      expect(status.action).toEqual({
        label: 'Review',
        target: { collection: 'user-submissions', id: 42 },
      })
    })

    it('reads a new class proposal as its own row', () => {
      const status = only({
        id: 55,
        kind: 'proposal',
        receivedAt: '2026-11-02T00:00:00.000Z',
        title: 'A proposed meditation class',
      })
      expect(status).toMatchObject({
        filter: 'review',
        key: 'class-proposed',
        label: 'New class proposed',
        rank: 1,
      })
      expect(status.line).toBe('Received 2 Nov 2026')
    })

    /** In no filter: an admin's list is the only one that holds these. */
    it('reads a refused sign-up as its own unfiltered row', () => {
      const status = only({
        id: 61,
        kind: 'refusal',
        reason: 'repeatedly refused sender',
        receivedAt: '2026-11-04T00:00:00.000Z',
        title: 'Nadia Haddad',
      })
      expect(status).toMatchObject({
        filter: null,
        key: 'confirmed-spam-pending',
        label: 'Flagged as spam',
        counts: true,
      })
      expect(status.line).toBe('repeatedly refused sender · 4 Nov 2026')
    })

    it('asks for a manager on an unadopted listing', () => {
      const status = only(event({ hasManager: false, verificationStage: 'unverified' }))
      expect(status).toMatchObject({
        filter: 'no-manager',
        key: 'no-manager',
        pill: 'warning',
        rank: 3,
      })
      expect(status.action).toEqual({
        label: 'Assign manager',
        target: { collection: 'events', id: 1 },
      })
    })

    /**
     * ⚠ `denied` is excluded. The community voted it off the map, so adopting
     * it is not the next step and listing it as unmanaged would ask for one.
     */
    it('does not ask for a manager on a denied listing', () => {
      expect(keysOf(event({ hasManager: false, verificationStage: 'denied' }))).toEqual([
        'up-to-date',
      ])
    })

    it('counts recommendations against nothing', () => {
      const status = only(event({ qualityOpenCount: 2 }))
      expect(status).toMatchObject({
        counts: false,
        filter: 'recommendations',
        key: 'recommendations',
        label: '2 recommendations',
        pill: 'always-white',
        rank: 4,
      })
      expect(status.action?.label).toBe('Improve listing')
    })

    it("uses the failed checks' own labels where the reader paid for them", () => {
      expect(only(event({ qualityOpenCount: 1 })).line).toBe(
        '1 thing would make this listing easier to find',
      )
      expect(
        only(event({ qualityOpenCount: 2, recommendations: ['Add photos', 'Add a description'] }))
          .line,
      ).toBe('Add photos, Add a description')
    })

    it('offers a draft the edit it was left in the middle of', () => {
      const status = only(event({ draft: true }))
      expect(status).toMatchObject({ filter: 'review', key: 'draft', pill: 'light-gray', rank: 5 })
      expect(status.line).toBe('Last edited 1 Nov 2026')
      expect(status.action?.label).toBe('Continue editing')
    })

    it('says when an expired listing will be deleted', () => {
      const status = only(
        event({ nextCheckAt: '2026-11-19T00:00:00.000Z', verificationStage: 'expired' }),
      )
      expect(status).toMatchObject({ filter: 'overdue', key: 'expired', rank: 6 })
      expect(status.line).toBe('Deleted on 19 Nov 2026')
    })

    it('draws the tick, not a pill, for a listing with nothing open', () => {
      const status = only(event({ nextCheckAt: '2026-12-01T00:00:00.000Z' }))
      expect(status).toMatchObject({ counts: false, key: 'up-to-date', pill: 'check', rank: 7 })
      expect(status.line).toBe('Next check 1 Dec 2026')
      expect(status.action).toBeNull()
    })

    it('leaves a finished listing with nothing to do', () => {
      const status = only(
        event({ scheduleEnd: '2026-09-30T00:00:00.000Z', verificationStage: 'finished' }),
      )
      expect(status).toMatchObject({ counts: false, key: 'finished', rank: 8 })
      expect(status.line).toBe('Ended 30 Sept 2026')
      expect(status.action).toBeNull()
    })

    it('covers every declared status', () => {
      const seen = new Set<string>([
        ...keysOf(event({ verificationStage: 'urgent' })),
        ...keysOf(
          event({
            proposal: { changedFields: [], id: 2, receivedAt: '2026-11-01T00:00:00.000Z' },
          }),
        ),
        ...keysOf({ id: 3, kind: 'proposal', receivedAt: '2026-11-01', title: 'x' }),
        ...keysOf({ id: 4, kind: 'refusal', reason: 'r', receivedAt: '2026-11-01', title: 'y' }),
        ...keysOf(event({ hasManager: false, verificationStage: 'unverified' })),
        ...keysOf(event({ qualityOpenCount: 1 })),
        ...keysOf(event({ draft: true })),
        ...keysOf(event({ verificationStage: 'expired' })),
        ...keysOf(event()),
        ...keysOf(event({ verificationStage: 'finished' })),
      ])
      expect([...seen].sort()).toEqual([...OPEN_ITEM_STATUSES].sort())
    })
  })

  describe("an admin's row", () => {
    const unmanaged = event({
      noRegionManager: true,
      region: { id: 9, name: 'Bavaria' },
      verificationStage: 'urgent',
    })

    it('says no region manager, and offers to add one', () => {
      const status = only(unmanaged)
      expect(status.line).toMatch(/· no region manager$/)
      expect(status.action).toEqual({
        label: 'Add region manager',
        target: { collection: 'regions', id: 9 },
      })
    })

    it("leaves everyone else's row verifying the event", () => {
      expect(only(event({ verificationStage: 'urgent' })).action?.target.collection).toBe('events')
    })
  })

  /**
   * ⚠ A row shows every status it has. Hiding one behind the other is how the
   * second never gets fixed — and the lowest rank is what places the row.
   */
  describe('a row with several statuses', () => {
    const busy = event({ draft: true, qualityOpenCount: 3, verificationStage: 'urgent' })

    it('shows all of them and is placed by the lowest rank', () => {
      const item = openItem(busy, NOW)
      expect(item.statuses.map((status) => status.key)).toEqual([
        'overdue',
        'recommendations',
        'draft',
      ])
      expect(item.rank).toBe(0)
    })

    it('belongs to every filter its statuses name, once each', () => {
      expect(openItemFilters(openItem(busy, NOW)).sort()).toEqual([
        'overdue',
        'recommendations',
        'review',
      ])
    })

    it('counts once, however many of its statuses count', () => {
      expect(openItem(busy, NOW).counts).toBe(true)
      expect(openItem(event({ qualityOpenCount: 3 }), NOW).counts).toBe(false)
    })
  })

  describe('sortOpenItems', () => {
    it('orders by rank, then the soonest deadline, then the longest wait', () => {
      const rows: OpenItemRow[] = [
        event({ id: 1, verificationStage: 'reminded' }),
        event({ id: 2, verificationStage: 'urgent' }),
        event({ createdAt: '2026-09-01T00:00:00.000Z', id: 3, verificationStage: 'escalated' }),
        event({ hasManager: false, id: 4, verificationStage: 'unverified' }),
      ]
      const ordered = sortOpenItems(rows.map((row) => openItem(row, NOW)))
      expect(ordered.map((item) => item.row.id)).toEqual([2, 3, 1, 4])
    })

    /**
     * A listing nobody has adopted is not on a clock, and one that is should
     * not be pushed down the page by it.
     */
    it('sorts a row with no deadline after the ones that have one', () => {
      const withDeadline = openItem(
        event({ id: 1, nextCheckAt: '2026-11-19T00:00:00.000Z', verificationStage: 'expired' }),
        NOW,
      )
      const without = openItem(event({ id: 2, verificationStage: 'expired' }), NOW)
      expect(sortOpenItems([without, withDeadline]).map((item) => item.row.id)).toEqual([1, 2])
    })
  })

  /**
   * ⚠ `total` is not the row count — it is what the scope holds that could
   * need something, so a change proposal is counted on the event it changes
   * rather than as a second thing to do.
   */
  describe('overviewProgress', () => {
    it('reads as a share on track, with the count still to go', () => {
      expect(overviewProgress(2, 8)).toEqual({
        label: '75% on track · 2 to go',
        open: 2,
        percent: 75,
        total: 8,
      })
    })

    it('calls an empty scope fully on track rather than dividing by zero', () => {
      expect(overviewProgress(0, 0)).toMatchObject({ percent: 100 })
    })
  })
})
