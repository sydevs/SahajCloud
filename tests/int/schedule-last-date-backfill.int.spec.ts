/**
 * Backfill of the derived `schedule.lastDate` column (#603).
 *
 * The interesting properties aren't the arithmetic (that's
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

  it('runs over app-cards too', async () => {
    // scheduleFields() is shared with AppCards, so the column exists there as well.
    const stats = await backfillScheduleLastDate({ payload, collection: 'app-cards', apply: true })
    expect(stats.failed).toBe(0)
  })
})
