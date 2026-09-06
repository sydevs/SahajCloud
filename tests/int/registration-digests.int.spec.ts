import type { EmailTestAdapter } from '../utils/emailTestAdapter'
import type { Payload } from 'payload'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { SendRegistrationDigests } from '@/jobs/RegistrationNotifications/SendRegistrationDigests'

import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

const SCHEDULE = {
  firstDate: '2026-07-01T09:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'DAILY',
  interval: 1,
} as const

const runDigests = (payload: Payload, now?: Date) =>
  runTaskHandler(SendRegistrationDigests, { payload, context: now ? { now } : {} })

/** The smallest Monday (UTC) at or after `from` — always ≥ now, so today's registrations stay in-window. */
function mondayOnOrAfter(from: Date): Date {
  const d = new Date(from)
  const daysUntilMonday = (1 - d.getUTCDay() + 7) % 7
  d.setUTCDate(d.getUTCDate() + daysUntilMonday)
  return d
}

describe('SendRegistrationDigests job', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let emailAdapter: EmailTestAdapter
  let regionId: number
  let seq = 0

  beforeAll(async () => {
    const env = await createTestEnvironmentWithEmail()
    payload = env.payload
    cleanup = env.cleanup
    emailAdapter = env.emailAdapter

    const region = await testData.createRegion(payload, { name: 'Dig City', slug: 'dig-city' })
    regionId = region.id
  })

  afterAll(async () => {
    await cleanup()
  })

  afterEach(() => {
    emailAdapter.clearCapturedEmails()
  })

  async function createManager(email: string, frequency: string): Promise<number> {
    const manager = await testData.createManager(payload, {
      name: `Dig ${email}`,
      email,
      notificationPreferences: { event_registration: { frequency, method: 'email' } },
    })
    return manager.id
  }

  async function createEvent(managerId: number, title: string): Promise<number> {
    const event = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>({
        title,
        languages: ['en'],
        eventType: 'online',
        onlineUrl: 'https://example.com/join',
        registrationMode: 'sahaj-atlas',
        manager: managerId,
        region: regionId,
        schedule: SCHEDULE,
        _status: 'published',
      }),
    })
    return event.id
  }

  async function register(
    eventId: number,
    name: string,
    questions?: Record<string, unknown>,
  ): Promise<void> {
    const email = `${name.toLowerCase()}-${(seq += 1)}@example.com`
    const user = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { name, email },
    })
    await payload.create({
      collection: 'registrations',
      overrideAccess: true,
      data: {
        event: eventId,
        user: user.id,
        uuid: `uuid-${email}`,
        ...(questions ? { questions } : {}),
      },
    })
  }

  function emailsTo(recipient: string) {
    return emailAdapter.getCapturedEmails().filter((email) => email.to === recipient)
  }

  it('sends one digest grouping all events, then re-sends nothing (watermark)', async () => {
    const managerId = await createManager('daily@example.com', 'Daily Summary')
    const eventA = await createEvent(managerId, 'Digest Event A')
    const eventB = await createEvent(managerId, 'Digest Event B')
    await register(eventA, 'Alice', { referral: 'A friend recommended it' })
    await register(eventA, 'Bob')
    await register(eventB, 'Cara')

    // Drop the manager-creation verification emails so only the digest remains.
    emailAdapter.clearCapturedEmails()
    await runDigests(payload)
    const sent = emailsTo('daily@example.com')
    expect(sent).toHaveLength(1)
    expect(String(sent[0].subject)).toBe('Registration summary: 3 new')
    const html = String(sent[0].html)
    expect(html).toContain('Digest Event A')
    expect(html).toContain('Digest Event B')
    expect(html).toContain('Alice')
    expect(html).toContain('Bob')
    expect(html).toContain('Cara')
    // Alice's registration-question answer is resolved and rendered.
    expect(html).toContain('A friend recommended it')

    const manager = await payload.findByID({
      collection: 'managers',
      id: managerId,
      overrideAccess: true,
    })
    expect(manager.lastRegistrationDigestSentAt).toBeTruthy()

    // Second run: the watermark now excludes those registrations.
    emailAdapter.clearCapturedEmails()
    await runDigests(payload)
    expect(emailsTo('daily@example.com')).toHaveLength(0)
  })

  it('does not send to an Immediate manager', async () => {
    const managerId = await createManager('immediate@example.com', 'Immediate')
    const event = await createEvent(managerId, 'Immediate Event')
    await register(event, 'Dave')

    emailAdapter.clearCapturedEmails()
    await runDigests(payload)
    expect(emailsTo('immediate@example.com')).toHaveLength(0)
  })

  it('sends no empty digest when a manager has no new registrations', async () => {
    const managerId = await createManager('empty@example.com', 'Daily Summary')
    await createEvent(managerId, 'Empty Event') // event but no registrations

    emailAdapter.clearCapturedEmails()
    await runDigests(payload)
    expect(emailsTo('empty@example.com')).toHaveLength(0)
  })

  it('fires a weekly digest only on the Monday anchor', async () => {
    // Monday run → weekly digest sent. Compute the anchor AFTER the registration
    // exists so runStart ≥ its createdAt (the window is `(since, runStart]`).
    const mondayMgr = await createManager('weekly-mon@example.com', 'Weekly Summary')
    const mondayEvent = await createEvent(mondayMgr, 'Weekly Monday Event')
    await register(mondayEvent, 'Eve')
    const monday = mondayOnOrAfter(new Date())
    emailAdapter.clearCapturedEmails()
    await runDigests(payload, monday)
    expect(emailsTo('weekly-mon@example.com')).toHaveLength(1)

    // A separate weekly manager on a Tuesday run → nothing (not the anchor).
    const tuesMgr = await createManager('weekly-tue@example.com', 'Weekly Summary')
    const tuesEvent = await createEvent(tuesMgr, 'Weekly Tuesday Event')
    await register(tuesEvent, 'Frank')
    const tuesday = mondayOnOrAfter(new Date())
    tuesday.setUTCDate(tuesday.getUTCDate() + 1)
    emailAdapter.clearCapturedEmails()
    await runDigests(payload, tuesday)
    expect(emailsTo('weekly-tue@example.com')).toHaveLength(0)
  })

  it('still includes a registration whose registrant unsubscribed from reminders', async () => {
    // The unsubscribe link covers registrant *reminders* only. Manager digests are
    // controlled by notificationPreferences, not that flag (#589). So a registrant's
    // reminder opt-out must NOT hide their registration from the manager's digest.
    const managerId = await createManager('unsub-digest@example.com', 'Daily Summary')
    const eventId = await createEvent(managerId, 'Unsub Digest Event')
    const user = await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { name: 'Grace', email: `grace-${(seq += 1)}@example.com` },
    })
    await payload.create({
      collection: 'registrations',
      overrideAccess: true,
      data: {
        event: eventId,
        user: user.id,
        uuid: `uuid-unsub-${user.id}`,
        remindersUnsubscribedAt: new Date().toISOString(),
      },
    })

    emailAdapter.clearCapturedEmails()
    await runDigests(payload)
    const sent = emailsTo('unsub-digest@example.com')
    expect(sent).toHaveLength(1)
    expect(String(sent[0].html)).toContain('Grace')
  })

  it('declares the single-run concurrency lock', () => {
    const concurrency = SendRegistrationDigests.concurrency as
      | { key: (args: { input: unknown; queue: string }) => string; exclusive?: boolean }
      | undefined
    expect(concurrency?.exclusive).toBe(true)
    expect(concurrency?.key({ input: {}, queue: 'nightly' })).toBe('sendRegistrationDigests')
  })
})
