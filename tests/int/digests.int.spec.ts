import type { EmailTestAdapter } from '../utils/emailTestAdapter'
import type { FixtureOverrides } from '../utils/testData'
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { SendDigests } from '@/jobs/Digests/SendDigests'
import { EMPTY_VERIFICATION } from '@/lib/clients/verification'
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
    ({
      context: { skipWriteGuard: true },
      headers: new Headers(),
      payload,
    }) as unknown as PayloadRequest

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
    (await payload.findByID({ collection: 'managers', id: managerId, overrideAccess: true }))
      .digestWatermarks ?? {}

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
      expect(String(sent[0]!.subject)).toBe('Your events: 3 new registrations')
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
        'Your events: 1 open item',
        'Your regions: 1 open item',
      ])

      /** A region email leaves out the manager's own listings. */
      const region = sent.find((email) => String(email.subject).startsWith('Your regions'))!
      expect(String(region.html)).toContain('Their escalated program')
      expect(String(region.html)).not.toContain('Both own program')
      const program = sent.find((email) => String(email.subject).startsWith('Your events'))!
      expect(String(program.html)).toContain('Both own program')

      const marks = await watermarksOf(both.id)
      expect(marks.program?.open_items).toBeTruthy()
      expect(marks.region?.open_items).toBeTruthy()

      // A retry, or a second manual run, the same day sends neither again.
      emailAdapter.clearCapturedEmails()
      await runDigests(payload)
      expect(emailsTo('both@example.com')).toHaveLength(0)
    })
  })

  describe('statistics', () => {
    /** Statistics arrive on the 1st, named for the month, and a quiet month still arrives as zero. */
    it('shows a quiet month as zero', async () => {
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
      const month = first.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
      expect(String(sent[0]!.subject)).toBe(`Your events: ${month} statistics`)
      const html = String(sent[0]!.html)
      expect(html).toContain('Statistics')
      expect(html).toContain('Registrations')
      // Nobody signed up, which is a zero rather than a missing section.
      expect(html).toContain('>0<')
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

    it('includes a registrant who opted out of their own reminders', async () => {
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
      expect(String(sent[0]!.text)).toMatch(
        /\d+ sign-ups? filed as spam in the last 7 days View http/,
      )
      expect((await watermarksOf(adminId)).admin?.refused_signups).toBeTruthy()
    })
  })

  /**
   * A missing map and a failing SEO check send no mail of their own (#1055):
   * each is an open item, read by the service's own managers under "Your
   * websites" and by an admin in their list.
   */
  describe('a service with a problem on its site', () => {
    it("reaches the service's managers and the admins, at the open-items pace", async () => {
      const managerId = await createManager('websites@example.com', {
        open_items: { frequency: 'Weekly' },
      })
      await createManager(
        'websites-admin@example.com',
        {
          new_proposals: { frequency: 'Never', method: '' },
          open_items: { frequency: 'Weekly' },
          refused_signups: { frequency: 'Never', method: '' },
          statistics: { frequency: 'Never', method: '' },
        },
        'admin',
      )
      const client = await testData.createClient(payload, managerId, {
        canonical: {
          verification: {
            ...EMPTY_VERIFICATION,
            seo: {
              at: '2026-11-08T07:00:00.000Z',
              results: [
                {
                  check: 'title',
                  detail: 'expected “Classes”, found “Home”',
                  route: '/',
                  status: 'fail',
                },
                { check: 'canonical', route: '/', status: 'pass' },
              ],
            },
          },
        },
        name: 'Essonne Digest Site',
        roles: ['sahaj-atlas-client'],
        site: { domain: 'essonne-digest.example', page: '/carte', track: 'custom' },
      })

      // Its map gone three nights running, after which the region was released.
      const missing = await testData.createClient(payload, managerId, {
        canonical: {
          verification: {
            ...EMPTY_VERIFICATION,
            attempts: [
              { at: '2026-11-08T03:00:00.000Z', reason: 'marker-absent', status: 'failed' },
            ],
            failureCount: 3,
            releasedAt: '2026-11-08T03:00:00.000Z',
          },
        },
        name: 'Missing Digest Site',
        roles: ['sahaj-atlas-client'],
        site: { domain: 'missing-digest.example', page: '/carte', track: 'custom' },
      })

      // A Monday, for the Weekly anchor.
      emailAdapter.clearCapturedEmails()
      await runDigests(payload, new Date('2026-11-09T07:00:00.000Z'))

      const sent = emailsTo('websites@example.com')
      expect(sent).toHaveLength(1)
      expect(String(sent[0]!.subject)).toBe('Your websites: 2 open items')
      const html = String(sent[0]!.html)
      expect(html).toContain('Essonne Digest Site')
      expect(html).toContain('Search problem')
      expect(html).toContain('Google is unable to read your map embed')
      expect(html).toContain('There is an issue with your map embed.')
      expect(html).not.toContain('Classes')
      expect(html).toContain(`/admin/collections/clients/${client.id}/install`)
      // The missing map first: visitors see nothing at all.
      expect(html.indexOf('Missing Digest Site')).toBeLessThan(html.indexOf('Essonne Digest Site'))
      expect(html).toContain('Map not found')
      expect(html).toContain('Your map was not found on your site')
      expect(html).toContain('No longer the home for its region’s links')
      expect(html).toContain(`/admin/collections/clients/${missing.id}/install`)
      expect((await watermarksOf(managerId)).service?.open_items).toBeTruthy()

      const admin = emailsTo('websites-admin@example.com')
      expect(admin).toHaveLength(1)
      expect(String(admin[0]!.html)).toContain('Essonne Digest Site')
    })
  })

  describe('exactly once', () => {
    /**
     * ⚠ **A manager who could rewind their own marks could have the day's
     * email, and every item since the mark, sent again.** Payload strips a field its
     * `access.update` refuses rather than erroring, so the PATCH succeeds with
     * the column unchanged — which is the behaviour to assert, not a 403.
     */
    it('refuses a manager writing their own watermarks', async () => {
      const managerId = await createManager('rewind@example.com', {
        open_items: { frequency: 'Never', method: '' },
      })
      await payload.db.updateOne({
        collection: 'managers',
        data: { digestWatermarks: { program: { open_items: '2026-11-01T00:00:00.000Z' } } },
        id: managerId,
        req: undefined,
      })
      const self = await testData.authUser(payload, { id: managerId })

      await payload.update({
        collection: 'managers',
        data: { digestWatermarks: { program: { open_items: '2020-01-01T00:00:00.000Z' } } },
        id: managerId,
        overrideAccess: false,
        user: { ...self, collection: 'managers' },
      })

      expect((await watermarksOf(managerId)).program?.open_items).toBe('2026-11-01T00:00:00.000Z')
    })
  })
})
