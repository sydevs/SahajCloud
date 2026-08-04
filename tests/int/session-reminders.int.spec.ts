import type { EmailTestAdapter } from '../utils/emailTestAdapter'
import type { Payload } from 'payload'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { SendSessionReminders } from '@/jobs/RegistrationNotifications/SendSessionReminders'

import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

// A daily class at 10:00 Europe/London (09:00 UTC in BST). With the run clock
// pinned below, exactly one occurrence — 2026-07-20T09:00:00Z — falls in the
// (now, now+24h] window, so the maths is deterministic, not wall-clock dependent.
const SCHEDULE = {
  firstDate: '2026-07-01T09:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'DAILY',
  interval: 1,
} as const
const NOW = new Date('2026-07-20T00:00:00.000Z')
const OCCURRENCE = '2026-07-20T09:00:00.000Z'
const OUT_OF_WINDOW = '2026-07-25T09:00:00.000Z'

const runReminders = (payload: Payload, now: Date = NOW) =>
  runTaskHandler(SendSessionReminders, { payload, context: { now } })

describe('SendSessionReminders job', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let emailAdapter: EmailTestAdapter
  let regionId: number
  let managerId: number
  let seq = 0

  beforeAll(async () => {
    const env = await createTestEnvironmentWithEmail()
    payload = env.payload
    cleanup = env.cleanup
    emailAdapter = env.emailAdapter

    const region = await testData.createRegion(payload, { name: 'Rem City', slug: 'rem-city' })
    regionId = region.id
    const manager = await testData.createManager(payload, { name: 'Rem Mgr' })
    managerId = manager.id
  })

  afterAll(async () => {
    await cleanup()
  })

  afterEach(() => {
    emailAdapter.clearCapturedEmails()
  })

  async function createEvent(overrides: Record<string, unknown> = {}): Promise<number> {
    const event = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>({
        title: `Reminder Event ${(seq += 1)}`,
        languages: ['en'],
        eventType: 'online',
        onlineUrl: 'https://example.com/join',
        registrationMode: 'sahaj-atlas',
        manager: managerId,
        region: regionId,
        schedule: SCHEDULE,
        _status: 'published',
        ...overrides,
      }),
    })
    return event.id
  }

  async function createRegistration(
    eventId: number,
    email: string,
    data: Record<string, unknown> = {},
  ): Promise<number> {
    const user = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { name: email.split('@')[0], email },
    })
    const registration = await payload.create({
      collection: 'registrations',
      overrideAccess: true,
      data: { event: eventId, user: user.id, uuid: `uuid-${email}`, ...data },
    })
    return registration.id
  }

  function emailsTo(recipient: string) {
    return emailAdapter.getCapturedEmails().filter((email) => email.to === recipient)
  }

  it('sends one reminder for the upcoming occurrence and re-sends nothing on a second run', async () => {
    const eventId = await createEvent()
    await createRegistration(eventId, 'series@example.com')

    await runReminders(payload)
    const first = emailsTo('series@example.com')
    expect(first).toHaveLength(1)
    expect(String(first[0].subject)).toContain('Reminder Event')
    // The unsubscribe link is present in the reminder footer.
    expect(String(first[0].html)).toContain('/registrations/unsubscribe?token=')

    // Second run within the same window: the occurrence is already logged.
    emailAdapter.clearCapturedEmails()
    await runReminders(payload)
    expect(emailsTo('series@example.com')).toHaveLength(0)
  })

  it('reminds a startingAt registrant only for that session', async () => {
    const eventId = await createEvent()
    await createRegistration(eventId, 'this-session@example.com', { startingAt: OCCURRENCE })
    await createRegistration(eventId, 'other-session@example.com', { startingAt: OUT_OF_WINDOW })

    await runReminders(payload)
    expect(emailsTo('this-session@example.com')).toHaveLength(1)
    // Their session is 5 days out — not in the next 24h.
    expect(emailsTo('other-session@example.com')).toHaveLength(0)
  })

  it('does not remind an unsubscribed registration, and leaves the record intact', async () => {
    const eventId = await createEvent()
    const registrationId = await createRegistration(eventId, 'unsubbed@example.com', {
      remindersUnsubscribedAt: NOW.toISOString(),
    })

    await runReminders(payload)
    expect(emailsTo('unsubbed@example.com')).toHaveLength(0)

    // Unsubscribing stops reminders without deleting the registration.
    const still = await payload.findByID({
      collection: 'registrations',
      id: registrationId,
      overrideAccess: true,
    })
    expect(still.id).toBe(registrationId)
  })

  it('does not remind for an unpublished event', async () => {
    const eventId = await createEvent({ _status: 'draft' })
    await createRegistration(eventId, 'draft-event@example.com')

    await runReminders(payload)
    expect(emailsTo('draft-event@example.com')).toHaveLength(0)
  })

  it('declares the single-run concurrency lock', () => {
    const concurrency = SendSessionReminders.concurrency as
      | { key: (args: { input: unknown; queue: string }) => string; exclusive?: boolean }
      | undefined
    expect(concurrency?.exclusive).toBe(true)
    expect(concurrency?.key({ input: {}, queue: 'nightly' })).toBe('sendSessionReminders')
  })
})
