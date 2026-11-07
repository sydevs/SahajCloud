import { describe, expect, it } from 'vitest'

import type { OpenItemEvent, OpenItemRow } from '@/lib/atlasOverview/status'
import {
  actionPrompt,
  openItem,
  overviewProgress,
  rowTarget,
  sortOpenItems,
} from '@/lib/atlasOverview/status'

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

const keysOf = (row: OpenItemRow) => openItem(row, NOW).statuses.map((status) => status.key)
const only = (row: OpenItemRow) => openItem(row, NOW).statuses[0]!

describe('openItem', () => {
  describe('every status in the table', () => {
    it('places an urgent listing ahead of everything, including a proposal', () => {
      const item = openItem(
        event({
          proposal: { changedFields: ['Title'], id: 7, receivedAt: '2026-11-01T00:00:00.000Z' },
          verificationStage: 'urgent',
        }),
        NOW,
      )
      expect(item.placing).toMatchObject({
        filter: 'overdue',
        key: 'overdue',
        label: 'Overdue',
        pill: 'error',
        counts: true,
      })
      expect(item.statuses.map((status) => status.key)).toEqual(['overdue', 'change-proposed'])
      expect(item.placing.action).toEqual({
        label: 'Verify',
        target: { collection: 'events', id: 1 },
      })
    })

    /** ⚠ From the stage's own check: an urgent listing unpublishes when it next comes due. */
    it('dates the unpublish from the next check, not from today', () => {
      const status = only(
        event({ nextCheckAt: '2026-11-09T00:00:00.000Z', verificationStage: 'urgent' }),
      )
      expect(status.lines).toEqual(['Unpublishes 9 Nov 2026'])
    })

    /** Three stages, one thing to do; `sortOpenItems` pins `urgent` jumping the queue. */
    it('gives reminded and escalated the same status', () => {
      for (const stage of ['reminded', 'escalated'] as const) {
        expect(only(event({ verificationStage: stage })).key).toBe('overdue')
      }
    })

    it('names the changed fields on a change proposal', () => {
      const status = only(
        event({
          proposal: {
            changedFields: ['Address', 'Schedule'],
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
      expect(status.lines).toEqual(['Address, Schedule', 'Received 3 Nov 2026'])
      expect(status.action).toEqual({
        label: 'Review',
        target: { collection: 'user-submissions', id: 42 },
      })
    })

    it('names three changed fields and counts the rest', () => {
      const status = only(
        event({
          proposal: {
            changedFields: ['Address', 'Schedule', 'Title', 'Description', 'Images'],
            id: 42,
            receivedAt: '2026-11-03T00:00:00.000Z',
          },
        }),
      )
      expect(status.lines).toEqual(['Address, Schedule, Title +2 more', 'Received 3 Nov 2026'])
    })

    it('reads a new class proposal as its own row', () => {
      const status = only({
        id: 55,
        kind: 'proposal',
        receivedAt: '2026-11-02T00:00:00.000Z',
        title: 'A proposed event',
      })
      expect(status).toMatchObject({
        filter: 'review',
        key: 'class-proposed',
        label: 'New event proposed',
        rank: 1,
      })
      expect(status.lines).toEqual(['Received 2 Nov 2026'])
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
      expect(status.lines).toEqual(['Repeatedly refused sender', 'Received 4 Nov 2026'])
    })

    it('asks for a manager on an unadopted listing', () => {
      const status = only(event({ hasManager: false, verificationStage: 'unverified' }))
      expect(status).toMatchObject({
        filter: 'no-manager',
        key: 'no-manager',
        pill: 'warning',
      })
      expect(status.action).toEqual({
        label: 'Assign manager',
        target: { collection: 'events', id: 1 },
      })
      // When it was added says nothing the pill does not.
      expect(status.lines).toEqual([])
    })

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
      expect(only(event({ qualityOpenCount: 1 })).lines).toEqual([
        '1 thing would make this listing easier to find',
      ])
      expect(
        only(event({ qualityOpenCount: 2, recommendations: ['Add photos', 'Add a description'] }))
          .lines,
      ).toEqual(['Add photos, Add a description'])
    })

    it('offers a draft the edit it was left in the middle of', () => {
      const status = only(event({ draft: true }))
      expect(status).toMatchObject({ filter: 'review', key: 'draft', pill: 'light-gray', rank: 5 })
      expect(status.lines).toEqual(['Last edited 1 Nov 2026'])
      expect(status.action?.label).toBe('Continue editing')
    })

    it('says when an expired listing will be deleted', () => {
      const status = only(
        event({ nextCheckAt: '2026-11-19T00:00:00.000Z', verificationStage: 'expired' }),
      )
      expect(status).toMatchObject({ filter: 'overdue', key: 'expired', rank: 6 })
      expect(status.lines).toEqual(['Deleted on 19 Nov 2026'])
    })

    it('draws the tick, not a pill, for a listing with nothing open', () => {
      const status = only(event({ nextCheckAt: '2026-12-01T00:00:00.000Z' }))
      expect(status).toMatchObject({ counts: false, key: 'up-to-date', pill: 'check', rank: 7 })
      expect(status.lines).toEqual(['Next check 1 Dec 2026'])
      expect(status.action).toBeNull()
    })

    it('leaves a finished listing with nothing to do', () => {
      const status = only(
        event({ scheduleEnd: '2026-09-30T00:00:00.000Z', verificationStage: 'finished' }),
      )
      expect(status).toMatchObject({ counts: false, key: 'finished', rank: 8 })
      expect(status.lines).toEqual(['Ended 30 Sept 2026'])
      expect(status.action).toBeNull()
    })
  })

  describe('the next step as a sentence', () => {
    it('says what the step is for, its opening words the link', () => {
      expect(actionPrompt(only(event({ verificationStage: 'urgent' })))).toEqual({
        after: ' to keep it on the map.',
        link: 'Verify this event',
      })
    })

    it('asks an admin for a region manager rather than a verification', () => {
      const status = only(event({ unmanagedRegionId: 9, verificationStage: 'urgent' }))
      expect(actionPrompt(status)?.link).toBe('Add a region manager')
    })

    it('has none for a status with no next step', () => {
      expect(actionPrompt(only(event({ verificationStage: 'finished' })))).toBeNull()
    })
  })

  describe("an admin's row", () => {
    const unmanaged = event({ unmanagedRegionId: 9, verificationStage: 'urgent' })

    it('says no region manager, and offers to add one', () => {
      const status = only(unmanaged)
      expect(status.lines).toContain('No region manager')
      expect(status.action).toEqual({
        label: 'Add region manager',
        target: { collection: 'regions', id: 9 },
      })
    })

    it("leaves everyone else's row verifying the event", () => {
      expect(only(event({ verificationStage: 'urgent' })).action?.target.collection).toBe('events')
    })
  })

  /** ⚠ A row shows every status it has, and the lowest rank places it. */
  describe('a row with several statuses', () => {
    const busy = event({ draft: true, qualityOpenCount: 3, verificationStage: 'urgent' })

    it('shows all of them and is placed by the lowest rank', () => {
      const item = openItem(busy, NOW)
      expect(item.statuses.map((status) => status.key)).toEqual([
        'overdue',
        'recommendations',
        'draft',
      ])
      expect(item.placing.key).toBe('overdue')
    })

    it('belongs to every filter its statuses name, once each', () => {
      expect(openItem(busy, NOW).filters.sort()).toEqual(['overdue', 'recommendations', 'review'])
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

    it('sorts a row with no deadline after the ones that have one', () => {
      const withDeadline = openItem(
        event({ id: 1, nextCheckAt: '2026-11-19T00:00:00.000Z', verificationStage: 'expired' }),
        NOW,
      )
      const without = openItem(event({ id: 2, verificationStage: 'expired' }), NOW)
      expect(sortOpenItems([without, withDeadline]).map((item) => item.row.id)).toEqual([1, 2])
    })
  })

  describe('a service with failing SEO checks (#1055)', () => {
    const service: OpenItemRow = {
      checkedAt: '2026-11-04T07:00:00.000Z',
      id: 43,
      kind: 'service',
      title: 'Yoga Essonne',
    }

    it('says what is wrong in plain words, and sends the reader to the Install tab', () => {
      const item = openItem(service, NOW)
      expect(item.placing).toMatchObject({
        action: { label: 'Review', target: { collection: 'clients', id: 43, view: 'install' } },
        key: 'search-problem',
        label: 'Search problem',
        lines: ['Google is unable to read your map embed', 'Checked 4 Nov 2026'],
        pill: 'warning',
      })
      expect(item.since).toBe('2026-11-04T07:00:00.000Z')
      expect(rowTarget(item.row)).toEqual({ collection: 'clients', id: 43, view: 'install' })
    })

    it('names the problem before the link, where there is room for a sentence', () => {
      expect(actionPrompt(openItem(service, NOW).placing)).toEqual({
        after: '',
        before: 'There is an issue with your map embed. ',
        link: 'Review it',
      })
    })
  })

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
