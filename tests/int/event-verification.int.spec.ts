import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { verifyEventAction } from '@/collections/Events/endpoints/verifyEventAction'
import { verifyEventLink } from '@/collections/Events/endpoints/verifyEventLink'
import { ExpireEvents } from '@/jobs/ExpireEvents/ExpireEvents'
import type { NotificationLogEntry } from '@/lib/eventVerification/log'
import { signVerifyToken } from '@/lib/eventVerification/token'
import type { Event, Manager } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * End-to-end coverage for the event verification lifecycle (#484): the
 * ExpireEvents job's stage machine + per-recipient log/resume, the
 * verify-on-save hook, and the explicit verify endpoints. Pure helpers
 * (period map, stage offsets, finished-check, token, email render) are unit
 * tested separately.
 */

type ExpireOutput = {
  processed: number
  finished: number
  advanced: number
  trashed: number
  remindersSent: number
  failed: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString()

async function runJob(payload: Payload): Promise<ExpireOutput> {
  const req = { payload, context: {}, headers: new Headers() } as Parameters<
    typeof ExpireEvents.handler
  >[0]['req']
  const res = await ExpireEvents.handler({
    req,
    input: {},
    job: {} as Parameters<typeof ExpireEvents.handler>[0]['job'],
    tasks: {} as Parameters<typeof ExpireEvents.handler>[0]['tasks'],
    inlineTask: (() => {}) as Parameters<typeof ExpireEvents.handler>[0]['inlineTask'],
  })
  return res.output as ExpireOutput
}

/** Back-date an event's nextCheckAt so the next run treats it as due. */
async function makeDue(payload: Payload, id: number): Promise<void> {
  await payload.update({
    collection: 'events',
    id,
    data: { nextCheckAt: daysAgo(1) },
    context: { skipVerifyHook: true },
    overrideAccess: true,
  })
}

async function getEvent(payload: Payload, id: number, trash = false): Promise<Event> {
  return payload.findByID({ collection: 'events', id, overrideAccess: true, trash })
}

function reminders(
  log: Event['notificationLog'],
): Extract<NotificationLogEntry, { kind: 'reminder' }>[] {
  const entries = Array.isArray(log) ? (log as NotificationLogEntry[]) : []
  return entries.filter(
    (e): e is Extract<NotificationLogEntry, { kind: 'reminder' }> => e.kind === 'reminder',
  )
}

describe('Event verification lifecycle', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUser: Manager
  let eventManager: Manager

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    adminUser = env.adminUser
    eventManager = await testData.createManager(payload, {
      name: 'Event Manager',
      email: 'event-manager@example.com',
      notificationPreferences: { event_verification: { frequency: 'Monthly', method: 'email' } },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  async function createEvent(overrides: Partial<Event> = {}): Promise<Event> {
    const hasScheduleOverride = 'schedule' in overrides
    const { schedule: scheduleOverride, ...rest } = overrides as Record<string, unknown>
    const data: Record<string, unknown> = {
      title: 'Lifecycle Event',
      language: 'en',
      eventType: 'online',
      onlineUrl: 'https://example.com/meet',
      registrationMode: 'sahaj-atlas',
      manager: eventManager.id,
      // Publish on create (the manager's publish action) so the expire →
      // draft flip is observable; the hook leaves _status to the save choice.
      _status: 'published',
      ...rest,
    }
    if (!hasScheduleOverride) {
      data.schedule = {
        firstDate: daysAgo(2),
        firstDate_tz: 'Europe/London',
        recurrenceType: 'DAILY',
        interval: 1,
      }
    } else if (scheduleOverride != null) {
      // A null override omits the schedule entirely (inactive events).
      data.schedule = scheduleOverride
    }
    return payload.create({ collection: 'events', overrideAccess: true, data: data as Event })
  }

  it('opens a verified, published cycle on create (verify-on-save hook)', async () => {
    const event = await createEvent()
    expect(event.verificationStage).toBe('verified')
    expect(event._status).toBe('published')
    expect(event.nextCheckAt).toBeTruthy()
    const log = Array.isArray(event.notificationLog)
      ? (event.notificationLog as NotificationLogEntry[])
      : []
    expect(log[0]).toMatchObject({ kind: 'verification', method: 're-save' })
  })

  it('drives an event verified → reminded → escalated → urgent → expired → trashed', async () => {
    const region = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: { name: 'Country LC', level: 'country', mapboxId: 'lc-country' },
    })
    const regionManager = await testData.createManager(payload, {
      name: 'Region Manager',
      email: 'region-manager@example.com',
    })
    const city = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: {
        name: 'City LC',
        level: 'city',
        mapboxId: 'lc-city',
        parent: region.id,
        managers: [regionManager.id],
      },
    })
    const event = await createEvent({ region: city.id })

    // verified → reminded: manager only, stays published.
    await makeDue(payload, event.id)
    const r1 = await runJob(payload)
    expect(r1).toMatchObject({ advanced: 1, remindersSent: 1, trashed: 0, finished: 0 })
    let fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('reminded')
    expect(fresh._status).toBe('published')
    const firstReminders = reminders(fresh.notificationLog)
    expect(firstReminders).toHaveLength(1)
    expect(firstReminders[0]).toMatchObject({
      stage: 'verified',
      channel: 'email',
      destination: 'event-manager@example.com',
    })

    // reminded → escalated: adds the region manager.
    await makeDue(payload, event.id)
    const r2 = await runJob(payload)
    expect(r2).toMatchObject({ advanced: 1, remindersSent: 2 })
    fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('escalated')
    expect(fresh._status).toBe('published')
    const escalatedDestinations = reminders(fresh.notificationLog)
      .filter((e) => e.stage === 'reminded')
      .map((e) => e.destination)
      .sort()
    expect(escalatedDestinations).toEqual([
      'event-manager@example.com',
      'region-manager@example.com',
    ])

    // escalated → urgent: final reminder, region included, still published.
    await makeDue(payload, event.id)
    const r3 = await runJob(payload)
    expect(r3).toMatchObject({ advanced: 1, remindersSent: 2 })
    fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('urgent')
    expect(fresh._status).toBe('published')

    // urgent → expired: unpublishes.
    await makeDue(payload, event.id)
    const r4 = await runJob(payload)
    expect(r4).toMatchObject({ advanced: 1, remindersSent: 2 })
    fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('expired')
    expect(fresh._status).toBe('draft')

    // expired → trashed (no email).
    await makeDue(payload, event.id)
    const r5 = await runJob(payload)
    expect(r5).toMatchObject({ trashed: 1, remindersSent: 0, advanced: 0 })
    const trashed = await getEvent(payload, event.id, true)
    expect(trashed.deletedAt).toBeTruthy()
  })

  it('re-running immediately sends nothing and advances nothing', async () => {
    const event = await createEvent()
    await makeDue(payload, event.id)
    await runJob(payload) // → reminded, nextCheckAt now in the future

    const before = await getEvent(payload, event.id)
    const second = await runJob(payload)
    const after = await getEvent(payload, event.id)

    // The event isn't due, so it isn't even examined.
    expect(second.remindersSent).toBe(0)
    expect(second.advanced).toBe(0)
    expect(after.verificationStage).toBe(before.verificationStage)
    expect(reminders(after.notificationLog)).toHaveLength(reminders(before.notificationLog).length)
  })

  it('resumes a partial fan-out by sending only the un-logged recipient', async () => {
    const region = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: { name: 'Country RS', level: 'country', mapboxId: 'rs-country' },
    })
    const regionManager = await testData.createManager(payload, {
      name: 'Resume Region Manager',
      email: 'resume-region@example.com',
    })
    const city = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: {
        name: 'City RS',
        level: 'city',
        mapboxId: 'rs-city',
        parent: region.id,
        managers: [regionManager.id],
      },
    })
    const event = await createEvent({ region: city.id })

    // Simulate a crash mid-fan-out at the escalated stage: the event manager
    // was already logged, but the region manager wasn't.
    await payload.update({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
      context: { skipVerifyHook: true },
      data: {
        verificationStage: 'escalated',
        nextCheckAt: daysAgo(1),
        notificationLog: [
          { kind: 'verification', at: daysAgo(40), by: null, method: 'import' },
          {
            kind: 'reminder',
            stage: 'escalated',
            at: daysAgo(1),
            manager: { id: eventManager.id, name: 'Event Manager' },
            channel: 'email',
            destination: 'event-manager@example.com',
          },
        ] as NotificationLogEntry[],
      },
    })

    const result = await runJob(payload)
    // Only the region manager (still missing) is sent — no duplicate.
    expect(result.remindersSent).toBe(1)
    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('urgent')
    const escalatedDestinations = reminders(fresh.notificationLog)
      .filter((e) => e.stage === 'escalated')
      .map((e) => e.destination)
      .sort()
    expect(escalatedDestinations).toEqual([
      'event-manager@example.com',
      'resume-region@example.com',
    ])
  })

  it('a manager save re-verifies and resets the cycle (method re-save)', async () => {
    const event = await createEvent()
    await makeDue(payload, event.id)
    await runJob(payload) // → reminded
    expect((await getEvent(payload, event.id)).verificationStage).toBe('reminded')

    // A manager edit (no skipVerifyHook) re-opens the cycle.
    await payload.update({
      collection: 'events',
      id: event.id,
      overrideAccess: true,
      data: { title: 'Edited Title' },
    })
    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('verified')
    expect(reminders(fresh.notificationLog)).toHaveLength(0)
    const log = fresh.notificationLog as NotificationLogEntry[]
    expect(log[0]).toMatchObject({ kind: 'verification', method: 're-save' })
  })

  it('the admin verify endpoint re-publishes an expired event (method verify-action)', async () => {
    const event = await createEvent()
    // Drive to expired (verified → reminded → escalated → urgent → expired).
    for (let i = 0; i < 4; i++) {
      await makeDue(payload, event.id)
      await runJob(payload)
    }
    expect((await getEvent(payload, event.id))._status).toBe('draft')

    const req = {
      payload,
      user: { ...adminUser, collection: 'managers' },
      routeParams: { id: String(event.id) },
      query: {},
      headers: new Headers(),
    } as unknown as Parameters<typeof verifyEventAction.handler>[0]
    const res = await verifyEventAction.handler(req)
    expect(res.status).toBe(200)

    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('verified')
    expect(fresh._status).toBe('published')
    const log = fresh.notificationLog as NotificationLogEntry[]
    expect(log[0]).toMatchObject({ kind: 'verification', method: 'verify-action' })
  })

  it('the tokenized email link verifies while logged out (method email-link)', async () => {
    const event = await createEvent()
    await makeDue(payload, event.id)
    await runJob(payload) // → reminded

    const token = signVerifyToken({ eventId: event.id, managerId: eventManager.id }, payload.secret)
    const req = {
      payload,
      routeParams: { id: String(event.id) },
      query: { token },
      headers: new Headers(),
    } as unknown as Parameters<typeof verifyEventLink.handler>[0]
    const res = await verifyEventLink.handler(req)
    expect(res.status).toBe(200)

    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('verified')
    const log = fresh.notificationLog as NotificationLogEntry[]
    expect(log[0]).toMatchObject({ kind: 'verification', method: 'email-link' })
    expect((log[0] as Extract<NotificationLogEntry, { kind: 'verification' }>).by?.id).toBe(
      eventManager.id,
    )
  })

  it('rejects an invalid token without changing the event', async () => {
    const event = await createEvent()
    const before = await getEvent(payload, event.id)
    const req = {
      payload,
      routeParams: { id: String(event.id) },
      query: { token: 'not-a-valid-token' },
      headers: new Headers(),
    } as unknown as Parameters<typeof verifyEventLink.handler>[0]
    const res = await verifyEventLink.handler(req)
    expect(res.status).toBe(400)
    const after = await getEvent(payload, event.id)
    expect(after.updatedAt).toBe(before.updatedAt)
  })

  it('marks a scheduleless-ended (non-inactive) event finished, no email', async () => {
    // One-off event whose only occurrence is in the past → empty upcomingDates.
    const event = await createEvent({
      schedule: { firstDate: daysAgo(5), firstDate_tz: 'Europe/London' },
    } as Partial<Event>)
    await makeDue(payload, event.id)
    const result = await runJob(payload)

    expect(result.finished).toBe(1)
    expect(result.remindersSent).toBe(0)
    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('finished')
    expect(fresh._status).toBe('draft')
    expect(fresh.nextCheckAt ?? null).toBeNull()
  })

  it('an inactive event expires through the ladder and never finishes', async () => {
    const event = await createEvent({ inactive: true, schedule: null } as Partial<Event>)
    await makeDue(payload, event.id)
    const result = await runJob(payload)

    expect(result.finished).toBe(0)
    expect(result.advanced).toBe(1)
    const fresh = await getEvent(payload, event.id)
    expect(fresh.verificationStage).toBe('reminded')
  })
})
