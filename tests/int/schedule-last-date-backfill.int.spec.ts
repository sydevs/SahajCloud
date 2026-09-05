/**
 * Backfill of the derived `schedule.lastDate` column (#603).
 *
 * The interesting properties are not the arithmetic (that's
 * tests/unit/schedule-hooks.spec.ts) but the side effects: it must fill a NULL
 * left by a pre-column row, must not disturb the verification cycle while doing
 * so, and must be a no-op the second time.
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { backfillScheduleLastDate } from '@/lib/schedule/backfillLastDate'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/** A one-off, long finished. */
const PAST_SCHEDULE = { firstDate: '2021-05-01T10:00:00.000Z', firstDate_tz: 'Europe/London' }
const EXPECTED_LAST_DATE = '2021-05-01T22:59:59.999Z' // end of the local day (BST, UTC+1)

describe('schedule.lastDate backfill', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let eventId: number

  /**
   * Blank the column the way a row written before it existed would look.
   * Goes through the DB adapter rather than `payload.update`, because the
   * `computeLastDate` field hook would immediately recompute it.
   */
  async function clearStoredLastDate(id: number): Promise<void> {
    await payload.db.updateOne({
      collection: 'events',
      where: { id: { equals: id } },
      data: { schedule: { lastDate: null } },
    })
  }

  const readSchedule = async (id: number) => {
    const doc = await payload.findByID({ collection: 'events', id, overrideAccess: true, depth: 0 })
    return doc
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const event = await testData.createEvent(payload, {
      title: 'Backfill Target',
      inactive: false,
      eventType: 'online',
      onlineUrl: 'https://example.com/backfill',
      schedule: PAST_SCHEDULE,
      _status: 'published',
    } as never)
    eventId = event.id
  })

  afterAll(async () => {
    await cleanup()
  })

  it('writes lastDate on a row where it is NULL', async () => {
    await clearStoredLastDate(eventId)
    expect((await readSchedule(eventId)).schedule?.lastDate).toBeNull()

    const stats = await backfillScheduleLastDate({ payload, collection: 'events', apply: true })

    expect(stats.changed).toBeGreaterThanOrEqual(1)
    expect(stats.failed).toBe(0)
    expect(new Date((await readSchedule(eventId)).schedule!.lastDate!).toISOString()).toBe(
      EXPECTED_LAST_DATE,
    )
  })

  it('leaves the verification cycle untouched while backfilling', async () => {
    const before = await readSchedule(eventId)
    await clearStoredLastDate(eventId)

    await backfillScheduleLastDate({ payload, collection: 'events', apply: true })

    const after = await readSchedule(eventId)
    // Without `skipVerifyHook` the write would look like a fresh verification and
    // reset the stage + nextCheckAt, silently restarting every escalation cycle.
    expect(after.verificationStage).toBe(before.verificationStage)
    expect(after.nextCheckAt).toBe(before.nextCheckAt)
    expect(after._status).toBe('published')
    // And no other schedule field was lost by writing the group back.
    expect(after.schedule?.firstDate).toBe(before.schedule?.firstDate)
    expect(after.schedule?.firstDate_tz).toBe(before.schedule?.firstDate_tz)
  })

  it('is a no-op on a second run', async () => {
    await backfillScheduleLastDate({ payload, collection: 'events', apply: true })

    const second = await backfillScheduleLastDate({ payload, collection: 'events', apply: true })
    expect(second.changed).toBe(0)
    expect(second.failed).toBe(0)
    expect(second.unchanged).toBeGreaterThanOrEqual(1)
  })

  it('reports without writing in dry-run mode', async () => {
    await clearStoredLastDate(eventId)

    const changes: Array<{ from: string | null; to: string | null }> = []
    const stats = await backfillScheduleLastDate({
      payload,
      collection: 'events',
      apply: false,
      onChange: ({ from, to }) => changes.push({ from, to }),
    })

    expect(stats.changed).toBeGreaterThanOrEqual(1)
    expect(changes).toContainEqual({ from: null, to: EXPECTED_LAST_DATE })
    // Still NULL — nothing was written.
    expect((await readSchedule(eventId)).schedule?.lastDate).toBeNull()
  })

  it('skips rows with no usable firstDate', async () => {
    // The factory's default event is inactive with no schedule at all.
    await testData.createEvent(payload, { title: 'Scheduleless' })

    const stats = await backfillScheduleLastDate({ payload, collection: 'events', apply: true })
    expect(stats.skipped).toBeGreaterThanOrEqual(1)
  })

  // Pins the one surprising interaction, found by measuring rather than reading:
  // `cleanupExpiredExclusions` strips a >1-day-past exclusion on every write
  // (including the create), while `computeLastDate` runs against the incoming
  // patch — so the create stores a `lastDate` that already reflects an exclusion
  // it did not keep. The backfill rewrites it to the reproducible value and then
  // converges. Inert in effect: both dates are in the past, so the event is
  // finished either way.
  it('rewrites a lastDate left unreproducible by exclusion cleanup, then converges', async () => {
    // Weekly Mondays from 2021-01-04, 3 occurrences: Jan 4, 11, 18 — with the
    // tail (Jan 18) excluded.
    const course = await testData.createEvent(payload, {
      title: 'Course With Past Break',
      inactive: false,
      eventType: 'online',
      onlineUrl: 'https://example.com/break',
      schedule: {
        firstDate: '2021-01-04T10:00:00.000Z',
        firstDate_tz: 'Europe/London',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['MO'],
        endingType: 'count',
        count: 3,
        exclusions: [{ startDate: '2021-01-18', reason: 'Historical break' }],
      },
    } as never)

    // The exclusion never persisted, yet lastDate reflects it (Jan 11, not Jan 18).
    expect(course.schedule?.exclusions ?? []).toHaveLength(0)
    expect(course.schedule?.lastDate).toBe('2021-01-11T23:59:59.999Z')

    await backfillScheduleLastDate({ payload, collection: 'events', apply: true })
    const first = await readSchedule(course.id)
    expect(first.schedule?.lastDate).toBe('2021-01-18T23:59:59.999Z')

    // …and it is stable from here.
    const second = await backfillScheduleLastDate({
      payload,
      collection: 'events',
      apply: true,
    })
    expect(second.changed).toBe(0)
  })

  it('runs over app-cards too', async () => {
    // scheduleFields() is shared with AppCards, so the column exists there as well.
    const stats = await backfillScheduleLastDate({ payload, collection: 'app-cards', apply: true })
    expect(stats.failed).toBe(0)
  })
})
