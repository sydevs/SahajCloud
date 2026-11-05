import type { EmailTestAdapter } from '../utils/emailTestAdapter'
import type { FixtureOverrides } from '../utils/testData'
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { SendDigests } from '@/jobs/Digests/SendDigests'
import { readWatermarks } from '@/jobs/Digests/watermarks'
import type { UserSubmission } from '@/payload-types'

import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

const SCHEDULE = {
  firstDate: '2026-07-01T09:00:00.000Z',
  firstDate_tz: 'Europe/London',
  interval: 1,
  recurrenceType: 'DAILY',
} as const

const runDigests = (payload: Payload, now?: Date) =>
  runTaskHandler(SendDigests, { context: now ? { now } : {}, payload })

/** The smallest Monday (UTC) at or after `from`, so today's rows stay in-window. */
function mondayOnOrAfter(from: Date): Date {
  const date = new Date(from)
  date.setUTCDate(date.getUTCDate() + ((1 - date.getUTCDay() + 7) % 7))
  return date
}

/** The 1st of the month at or after `from`, for the Monthly anchor. */
function firstOfMonthOnOrAfter(from: Date): Date {
  const date = new Date(from)
  date.setUTCMonth(date.getUTCMonth() + 1, 1)
  return date
}

/**
 * The nightly digest: one email per manager per role, holding only what is due.
 *
 * ⚠ **`req.context.now` is the only clock here.** Daily, Weekly and Monthly are
 * decided from the run's own time, so every anchor case sets it rather than
 * waiting for a Monday.
 */
describe('SendDigests job', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let emailAdapter: EmailTestAdapter
  let regionId: number
  let seq = 0
  let startSlot = 0

  const systemReq = () =>
    ({ context: { skipWriteGuard: true }, headers: new Headers(), payload }) as unknown as PayloadRequest

  beforeAll(async () => {
    const env = await createTestEnvironmentWithEmail()
    payload = env.payload
    cleanup = env.cleanup
    emailAdapter = env.emailAdapter
    const region = await testData.createRegion(payload, { name: 'Dig City', slug: 'dig-city' })
    regionId = region.id
  })

  afterAll(async () => cleanup())
  afterEach(() => emailAdapter.clearCapturedEmails())

  async function createManager(
    email: string,
    preferences: Record<string, { frequency: string; method?: string }>,
    type: 'admin' | 'manager' = 'manager',
  ): Promise<number> {
    const manager = await testData.createManager(payload, {
      email,
      name: `Dig ${email}`,
      notificationPreferences: Object.fromEntries(
        Object.entries(preferences).map(([key, value]) => [
          key,
          { frequency: value.frequency, method: value.method ?? 'email' },
        ]),
      ),
      type,
    })
    return manager.id
  }

  // One region, all online: the duplicate-class rule keys the fixtures apart on
  // start time alone, so each event starts a minute after the last.
  async function createEvent(
    managerId: null | number,
    title: string,
    overrides: FixtureOverrides<Parameters<typeof createData<'events'>>[0]> = {},
  ): Promise<number> {
    startSlot += 1
    const event = await payload.create({
      collection: 'events',
      data: createData<'events'>({
        _status: 'published',
        eventType: 'online',
        languages: ['en'],
        manager: managerId,
        onlineUrl: 'https://example.com/join',
        region: regionId,
        registrationMode: 'sahaj-atlas',
        schedule: {
          ...SCHEDULE,
          firstDate: new Date(Date.parse(SCHEDULE.firstDate) + startSlot * 60_000).toISOString(),
        },
        title,
        ...overrides,
      }),
      overrideAccess: true,
    })
    return event.id
  }

  async function register(
    eventId: number,
    name: string,
    answers: Record<string, string> = {},
    overrides: FixtureOverrides<UserSubmission> = {},
  ): Promise<void> {
    await payload.create({
      collection: 'user-submissions',
      data: createData<'user-submissions'>({
        event: eventId,
        senderEmail: `${name.toLowerCase()}-${(seq += 1)}@example.com`,
        submissionData: [
          { field: 'name', value: name },
          ...Object.entries(answers).map(([field, value]) => ({ field, value })),
        ],
        type: 'registration',
        ...overrides,
      }),
      overrideAccess: true,
    })
  }

  const emailsTo = (recipient: string) =>
    emailAdapter.getCapturedEmails().filter((email) => email.to === recipient)

  const watermarksOf = async (managerId: number) =>
    readWatermarks(
      await payload.findByID({ collection: 'managers', id: managerId, overrideAccess: true }),
    )

  describe('one email per manager per role', () => {
    it('sends the program email, and re-sends nothing on the next run', async () => {
      const managerId = await createManager('program@example.com', {
        event_registration: { frequency: 'Daily' },
        open_items: { frequency: 'Never' },
        statistics: { frequency: 'Never' },
      })
      const eventA = await createEvent(managerId, 'Digest Event A')
      const eventB = await createEvent(managerId, 'Digest Event B')
      await register(eventA, 'Alice', { referral: 'A friend recommended it' })
      await register(eventA, 'Bob')
      await register(eventB, 'Cara')

      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      const sent = emailsTo('program@example.com')
      expect(sent).toHaveLength(1)
      expect(String(sent[0]!.subject)).toBe('Your programs: 3 new registrations')
      const html = String(sent[0]!.html)
      for (const text of ['Digest Event A', 'Digest Event B', 'Alice', 'Bob', 'Cara']) {
        expect(html).toContain(text)
      }
      expect(html).toContain('A friend recommended it')
      expect(html).toContain('Open your dashboard')
      expect(html).toContain('Manage notifications')

      expect((await watermarksOf(managerId)).program?.event_registration).toBeTruthy()

      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      expect(emailsTo('program@example.com')).toHaveLength(0)
    })

    /**
     * ⚠ One manager, two roles, two emails. A single email mixing them would
     * make every section somebody else's problem.
     */
    it('sends a program and a region email to one manager who is both', async () => {
      const both = await testData.createManager(payload, {
        email: 'both@example.com',
        name: 'Both',
        notificationPreferences: {
          event_registration: { frequency: 'Never', method: '' },
          open_items: { frequency: 'Daily', method: 'email' },
          statistics: { frequency: 'Never', method: '' },
        },
        type: 'manager',
      })
      const city = await testData.createRegion(payload, { name: 'Both City', slug: 'both-city' })
      await payload.update({
        collection: 'regions',
        data: { managers: [both.id] },
        id: city.id,
        overrideAccess: true,
      })
      const own = await createEvent(both.id, 'Both own program')
      await payload.update({
        collection: 'events',
        context: { skipVerifyHook: true },
        data: { verificationStage: 'urgent' },
        id: own,
      })
      // Another manager's listing in the region, escalated enough to reach them.
      const other = await testData.createManager(payload, { roles: [], type: 'manager' })
      const theirs = await payload.create({
        collection: 'events',
        data: createData<'events'>({
          _status: 'published',
          eventType: 'online',
          languages: ['en'],
          manager: other.id,
          onlineUrl: 'https://example.com/join',
          region: city.id,
          registrationMode: 'sahaj-atlas',
          schedule: { ...SCHEDULE, firstDate: '2026-07-02T09:00:00.000Z' },
          title: 'Their escalated program',
        }),
        overrideAccess: true,
      })
      await payload.update({
        collection: 'events',
        context: { skipVerifyHook: true },
        data: { verificationStage: 'escalated' },
        id: theirs.id,
      })

      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      const sent = emailsTo('both@example.com')
      expect(sent.map((email) => String(email.subject)).sort()).toEqual([
        'Your programs: 1 open item',
        'Your regions: 1 open item',
      ])

      /** A region email leaves out the manager's own listings. */
      const region = sent.find((email) => String(email.subject).startsWith('Your regions'))!
      expect(String(region.html)).toContain('Their escalated program')
      expect(String(region.html)).not.toContain('Both own program')
      const program = sent.find((email) => String(email.subject).startsWith('Your programs'))!
      expect(String(program.html)).toContain('Both own program')

      const marks = await watermarksOf(both.id)
      expect(marks.program?.open_items).toBeTruthy()
      expect(marks.region?.open_items).toBeTruthy()
    })
  })

  describe('the due rule', () => {
    it('sends nothing to a manager on Immediate or Never', async () => {
      const managerId = await createManager('immediate@example.com', {
        event_registration: { frequency: 'Immediate' },
        new_proposals: { frequency: 'Immediate' },
        open_items: { frequency: 'Never', method: '' },
        statistics: { frequency: 'Never', method: '' },
      })
      const event = await createEvent(managerId, 'Immediate Event')
      await register(event, 'Dave')

      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      expect(emailsTo('immediate@example.com')).toHaveLength(0)
    })

    it('fires Weekly on the Monday anchor and not a day later', async () => {
      const mondayId = await createManager('weekly-mon@example.com', {
        event_registration: { frequency: 'Weekly' },
        open_items: { frequency: 'Never', method: '' },
        statistics: { frequency: 'Never', method: '' },
      })
      await register(await createEvent(mondayId, 'Weekly Monday Event'), 'Eve')
      const monday = mondayOnOrAfter(new Date())
      emailAdapter.clearCapturedEmails()
      await runDigests(payload, monday)
      expect(emailsTo('weekly-mon@example.com')).toHaveLength(1)

      const tuesdayId = await createManager('weekly-tue@example.com', {
        event_registration: { frequency: 'Weekly' },
        open_items: { frequency: 'Never', method: '' },
        statistics: { frequency: 'Never', method: '' },
      })
      await register(await createEvent(tuesdayId, 'Weekly Tuesday Event'), 'Frank')
      const tuesday = new Date(monday)
      tuesday.setUTCDate(tuesday.getUTCDate() + 1)
      emailAdapter.clearCapturedEmails()
      await runDigests(payload, tuesday)
      expect(emailsTo('weekly-tue@example.com')).toHaveLength(0)
    })

    /** Statistics arrive on the 1st, and a quiet month still arrives as zero. */
    it('fires Monthly on the 1st, with a quiet month shown as zero', async () => {
      const managerId = await createManager('monthly@example.com', {
        event_registration: { frequency: 'Never', method: '' },
        open_items: { frequency: 'Never', method: '' },
        statistics: { frequency: 'Monthly' },
      })
      await createEvent(managerId, 'Monthly Stats Event')

      const first = firstOfMonthOnOrAfter(new Date())
      emailAdapter.clearCapturedEmails()
      await runDigests(payload, first)
      const sent = emailsTo('monthly@example.com')
      expect(sent).toHaveLength(1)
      const html = String(sent[0]!.html)
      expect(html).toContain('Analytics')
      expect(html).toContain('Registrations')
      // Nobody signed up, which is a zero rather than a missing section.
      expect(html).toContain('>0<')

      const second = new Date(first)
      second.setUTCDate(2)
      emailAdapter.clearCapturedEmails()
      await runDigests(payload, second)
      expect(emailsTo('monthly@example.com')).toHaveLength(0)
    })
  })

  describe('what a section carries', () => {
    it('sends no empty email, and still advances the watermark', async () => {
      const managerId = await createManager('empty@example.com', {
        event_registration: { frequency: 'Daily' },
        open_items: { frequency: 'Never', method: '' },
        statistics: { frequency: 'Never', method: '' },
      })
      await createEvent(managerId, 'Empty Event')

      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      expect(emailsTo('empty@example.com')).toHaveLength(0)
      // ⚠ The mark still moves: otherwise the first email after a quiet spell
      // would carry everything since the last send.
      expect((await watermarksOf(managerId)).program?.event_registration).toBeTruthy()
    })

    /**
     * ⚠ An override address gets the notice at once, so counting its
     * registrations here would send them twice.
     */
    it('leaves out an event carrying an override address', async () => {
      const managerId = await createManager('override@example.com', {
        event_registration: { frequency: 'Daily' },
        open_items: { frequency: 'Never', method: '' },
        statistics: { frequency: 'Never', method: '' },
      })
      const overridden = await createEvent(managerId, 'Overridden Event', {
        registrationNotificationEmail: 'ops@example.org',
      })
      await register(overridden, 'Hank')

      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      expect(emailsTo('override@example.com')).toHaveLength(0)
    })

    it("includes a registrant who opted out of their own reminders", async () => {
      // `unsubscribedAt` covers registrant reminders only; the manager's digest
      // is their own preference's business.
      const managerId = await createManager('unsub@example.com', {
        event_registration: { frequency: 'Daily' },
        open_items: { frequency: 'Never', method: '' },
        statistics: { frequency: 'Never', method: '' },
      })
      const eventId = await createEvent(managerId, 'Unsub Event')
      await register(eventId, 'Grace', {}, { unsubscribedAt: new Date().toISOString() })

      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      const sent = emailsTo('unsub@example.com')
      expect(sent).toHaveLength(1)
      expect(String(sent[0]!.html)).toContain('Grace')
    })

    /** Nobody else's address appears in a digest. */
    it('names no other manager', async () => {
      const managerId = await createManager('privacy@example.com', {
        event_registration: { frequency: 'Daily' },
        open_items: { frequency: 'Never', method: '' },
        statistics: { frequency: 'Never', method: '' },
      })
      const colleague = await testData.createManager(payload, {
        email: 'colleague@example.com',
        roles: [],
        type: 'manager',
      })
      const eventId = await createEvent(managerId, 'Privacy Event')
      await register(eventId, 'Ivy')

      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      const sent = emailsTo('privacy@example.com')
      expect(sent).toHaveLength(1)
      expect(String(sent[0]!.html)).not.toContain(colleague.email)
      expect(String(sent[0]!.text)).not.toContain(colleague.email)
    })

    it('reaches admins with the refused sign-ups the next morning', async () => {
      const adminId = await createManager(
        'refusals@example.com',
        {
          new_proposals: { frequency: 'Never', method: '' },
          open_items: { frequency: 'Never', method: '' },
          refused_signups: { frequency: 'Daily' },
          statistics: { frequency: 'Never', method: '' },
        },
        'admin',
      )
      // A listing needs a manager at `verified`, and whose it is does not
      // matter here — the refused sign-up is what the admin's list holds.
      const host = await testData.createManager(payload, { roles: [], type: 'manager' })
      const eventId = await createEvent(host.id, 'Refused Event')
      await payload.create({
        collection: 'user-submissions',
        data: {
          event: eventId,
          senderEmail: 'spammer@example.com',
          status: 'spam',
          submissionData: [{ field: 'name', value: 'Jude Spam' }],
          type: 'registration',
        } as never,
        overrideAccess: true,
        req: systemReq(),
      })

      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      const sent = emailsTo('refusals@example.com')
      expect(sent).toHaveLength(1)
      expect(String(sent[0]!.subject)).toMatch(/^Sahaj Atlas: /)
      expect(String(sent[0]!.html)).toContain('Jude Spam')
      expect((await watermarksOf(adminId)).admin?.refused_signups).toBeTruthy()
    })
  })

  describe('exactly once', () => {
    it('declares the single-run concurrency lock', () => {
      const concurrency = SendDigests.concurrency as
        | undefined
        | { exclusive?: boolean; key: (args: { input: unknown; queue: string }) => string }
      expect(concurrency?.exclusive).toBe(true)
      expect(concurrency?.key({ input: {}, queue: 'nightly' })).toBe('sendDigests')
    })

    /**
     * ⚠ The clamp is the point: a manager turning a section back on after
     * months has a watermark from months ago, and without it their first email
     * would carry the lot.
     */
    it('clamps the window to one period when the watermark is older', async () => {
      const managerId = await createManager('clamped@example.com', {
        event_registration: { frequency: 'Daily' },
        open_items: { frequency: 'Never', method: '' },
        statistics: { frequency: 'Never', method: '' },
      })
      const eventId = await createEvent(managerId, 'Clamped Event')
      const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      await payload.db.updateOne({
        collection: 'managers',
        data: { digestWatermarks: { program: { event_registration: old.toISOString() } } },
        id: managerId,
        req: undefined,
      })
      // Registered 10 days ago: inside the stale watermark's reach, outside a
      // one-day window.
      await payload.update({
        collection: 'user-submissions',
        data: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() } as never,
        id: (
          await payload.create({
            collection: 'user-submissions',
            data: createData<'user-submissions'>({
              event: eventId,
              senderEmail: 'old@example.com',
              submissionData: [{ field: 'name', value: 'Older' }],
              type: 'registration',
            }),
            overrideAccess: true,
          })
        ).id,
        overrideAccess: true,
      })

      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      expect(emailsTo('clamped@example.com')).toHaveLength(0)
    })
  })
})
