/**
 * Refused sign-ups reach admins (sydevs/SahajAtlasWeb#259): what records a
 * refusal at each stage, what it keeps, and who the digest goes to.
 *
 * The request stage is recorded by the collection's `afterError` hook, which
 * Payload runs from `routeError` alone, and this lane has no REST client — so
 * the spec makes the real create fail through the Local API, then hands the
 * caught error and the body to the collection's own hooks exactly as
 * `routeError` does (`payload/dist/utilities/routeError.js`).
 *
 * Two dependencies are stubbed: the Turnstile siteverify call and the MX lookup.
 */
import type { EmailTestAdapter } from '../utils/emailTestAdapter'
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { CleanupCollections } from '@/jobs/CleanupCollections/CleanupCollections'
import { SendRefusedRegistrationDigests } from '@/jobs/RegistrationNotifications/SendRefusedRegistrationDigests'
import type { Client, Manager, RegistrationRefusal, UserSubmission } from '@/payload-types'

import { deletedIn } from '../utils/retention'
import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

const { verifyMock, mxMock } = vi.hoisted(() => ({ verifyMock: vi.fn(), mxMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({ verifyTurnstileToken: verifyMock }))
vi.mock('@/lib/antiSpam/mxRecords', () => ({ hasMxRecords: mxMock }))

const { ScreenSubmissions } = await import('@/jobs/ScreenSubmissions/ScreenSubmissions')

const SCHEDULE = {
  firstDate: '2026-07-01T09:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'DAILY',
  interval: 1,
} as const

/** The smallest Monday (UTC) at or after `from`. */
function mondayOnOrAfter(from: Date): Date {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() + ((1 - d.getUTCDay() + 7) % 7))
  return d
}

describe('Refused sign-ups digest', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let emailAdapter: EmailTestAdapter
  let owner: Manager
  let client: Client
  let regionId: number
  let startSlot = 0
  let seq = 0

  const clientReq = (token = 'tok-bad'): PayloadRequest =>
    ({
      payload,
      headers: new Headers({ 'x-turnstile-token': token }),
      user: { ...client, collection: 'clients' },
      context: {},
    }) as unknown as PayloadRequest

  async function createEvent(title: string): Promise<number> {
    startSlot += 1
    const event = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>({
        title,
        languages: ['en'],
        eventType: 'online',
        onlineUrl: 'https://example.com/join',
        registrationMode: 'sahaj-atlas',
        manager: owner.id,
        region: regionId,
        schedule: {
          ...SCHEDULE,
          firstDate: new Date(Date.parse(SCHEDULE.firstDate) + startSlot * 60_000).toISOString(),
        },
        _status: 'published',
      }),
    })
    return event.id
  }

  /** Make a real client create fail, then run the collection's `afterError` as `routeError` would. */
  async function refuseAtRequest(
    data: Record<string, unknown>,
    req: PayloadRequest = clientReq(),
  ): Promise<unknown> {
    let error: unknown
    try {
      await payload.create({
        collection: 'user-submissions',
        data: data as never,
        overrideAccess: false,
        req,
      })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeDefined()

    const collection = payload.collections['user-submissions'].config
    const routedReq = Object.assign(req, { data })
    for (const hook of collection.hooks.afterError ?? []) {
      await hook({
        collection,
        context: routedReq.context,
        error: error as Error,
        req: routedReq,
        result: {} as never,
      })
    }
    return error
  }

  const registration = (eventId: number, overrides: Record<string, unknown> = {}) => ({
    type: 'registration',
    event: eventId,
    senderEmail: `visitor-${(seq += 1)}@example.com`,
    submissionData: [{ field: 'name', value: `Visitor ${seq}` }],
    ...overrides,
  })

  const refusalsFor = async (eventId: number) =>
    (
      await payload.find({
        collection: 'registration-refusals',
        where: { event: { equals: eventId } },
        depth: 0,
        overrideAccess: true,
      })
    ).docs as RegistrationRefusal[]

  const runDigests = (now: Date) =>
    runTaskHandler(SendRefusedRegistrationDigests, { payload, context: { now } })

  const emailsTo = (recipient: string) =>
    emailAdapter.getCapturedEmails().filter((email) => email.to === recipient)

  beforeAll(async () => {
    const env = await createTestEnvironmentWithEmail()
    payload = env.payload
    cleanup = env.cleanup
    emailAdapter = env.emailAdapter

    owner = await testData.createManager(payload, {
      name: 'Class Owner',
      email: 'owner@example.com',
    })
    client = await testData.createClient(payload, owner.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
    regionId = (
      await testData.createRegion(payload, { name: 'Refusal City', slug: 'refusal-city' })
    ).id
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    verifyMock.mockReset()
    verifyMock.mockImplementation(async (token: string) =>
      token === 'tok-valid'
        ? { success: true }
        : { success: false, reason: 'rejected', errorCodes: ['invalid-input-response'] },
    )
    mxMock.mockReset()
    mxMock.mockResolvedValue(true)
  })

  afterEach(() => {
    emailAdapter.clearCapturedEmails()
  })

  describe('recording a refusal at the form', () => {
    it('keeps the class and the reason, and nothing the visitor typed', async () => {
      const eventId = await createEvent('Captcha Class')
      await refuseAtRequest(registration(eventId))

      const [refusal, ...rest] = await refusalsFor(eventId)
      expect(rest).toHaveLength(0)
      expect(refusal).toMatchObject({ event: eventId, stage: 'request', reason: 'captcha_failed' })
      expect(refusal.submission ?? null).toBeNull()

      // No row anywhere carries the refused visitor's address.
      const { totalDocs } = await payload.count({
        collection: 'user-submissions',
        where: { event: { equals: eventId } },
        overrideAccess: true,
      })
      expect(totalDocs).toBe(0)
    })

    it('records our own captcha failure too, which is what refuses everyone', async () => {
      verifyMock.mockResolvedValue({ success: false, reason: 'not-configured' })
      const eventId = await createEvent('Unconfigured Class')
      await refuseAtRequest(registration(eventId))

      expect((await refusalsFor(eventId)).map((row) => row.reason)).toEqual(['captcha_unavailable'])
    })

    it('records a content refusal raised by the intake hook, not only the write guard', async () => {
      const eventId = await createEvent('Link Class')
      await refuseAtRequest(
        registration(eventId, {
          submissionData: [{ field: 'name', value: 'Buy now at cheap.shop' }],
        }),
        clientReq('tok-valid'),
      )

      expect((await refusalsFor(eventId)).map((row) => row.reason)).toEqual(['urls_not_allowed'])
    })

    it('records nothing for another type, a class that does not exist, or a manager', async () => {
      const eventId = await createEvent('Quiet Class')

      await refuseAtRequest({ ...registration(eventId), type: 'contact' })
      await refuseAtRequest(registration(2_000_000_000))

      const managerReq = {
        payload,
        headers: new Headers(),
        user: { ...owner, collection: 'managers' },
        context: {},
      } as unknown as PayloadRequest
      const collection = payload.collections['user-submissions'].config
      for (const hook of collection.hooks.afterError ?? []) {
        await hook({
          collection,
          context: {},
          error: Object.assign(new Error('x'), { data: { code: 'captcha_failed' } }),
          req: Object.assign(managerReq, { data: registration(eventId) }),
          result: {} as never,
        })
      }

      expect(await refusalsFor(eventId)).toHaveLength(0)
      const { totalDocs } = await payload.count({
        collection: 'registration-refusals',
        where: { event: { exists: false } },
        overrideAccess: true,
      })
      expect(totalDocs).toBe(0)
    })

    it('records nothing for a refusal that is not the spam check', async () => {
      const eventId = await createEvent('Malformed Class')
      const error = await refuseAtRequest(
        registration(eventId, { submissionData: [{ field: 'not_a_question', value: 'x' }] }),
        clientReq('tok-valid'),
      )
      expect((error as { data?: { code?: string } }).data?.code).toBe('submission_data_invalid')
      expect(await refusalsFor(eventId)).toHaveLength(0)
    })
  })

  describe('recording a refusal at screening', () => {
    it('links the refused registration, which holds who it was', async () => {
      const eventId = await createEvent('Screened Class')
      mxMock.mockResolvedValue(false)
      const submission = (await payload.create({
        collection: 'user-submissions',
        data: createData<'user-submissions'>({
          type: 'registration',
          event: eventId,
          senderEmail: 'nomail@example.com',
          submissionData: [{ field: 'name', value: 'Nomail Person' }],
        }),
        overrideAccess: true,
      })) as UserSubmission

      await runTaskHandler(ScreenSubmissions, { payload, input: { submissionId: submission.id } })
      // A retry finds the row settled and records nothing more.
      await runTaskHandler(ScreenSubmissions, { payload, input: { submissionId: submission.id } })

      expect(await refusalsFor(eventId)).toEqual([
        expect.objectContaining({
          stage: 'screening',
          reason: 'no_mx_records',
          submission: submission.id,
        }),
      ])
    })
  })

  describe('the digest', () => {
    it('reaches each admin at their cadence, and no one else', async () => {
      const eventId = await createEvent('Digest Class')
      await refuseAtRequest(registration(eventId))
      await refuseAtRequest(registration(eventId))
      mxMock.mockResolvedValue(false)
      const screened = (await payload.create({
        collection: 'user-submissions',
        data: createData<'user-submissions'>({
          type: 'registration',
          event: eventId,
          senderEmail: 'quiet-visitor@example.com',
          submissionData: [{ field: 'name', value: 'Quiet Visitor' }],
        }),
        overrideAccess: true,
      })) as UserSubmission
      await runTaskHandler(ScreenSubmissions, { payload, input: { submissionId: screened.id } })

      await testData.createManager(payload, {
        type: 'admin',
        name: 'Daily Admin',
        email: 'daily-admin@example.com',
        notificationPreferences: {
          refused_registrations: { frequency: 'Daily Summary', method: 'email' },
        },
      })
      // An admin from before this preference existed gets the type's default.
      await testData.createManager(payload, {
        type: 'admin',
        name: 'Unset Admin',
        email: 'unset-admin@example.com',
        notificationPreferences: {},
      })
      await testData.createManager(payload, {
        type: 'admin',
        name: 'Muted Admin',
        email: 'muted-admin@example.com',
        notificationPreferences: { refused_registrations: { frequency: 'Never', method: '' } },
      })
      await testData.createManager(payload, {
        type: 'manager',
        name: 'Plain Manager',
        email: 'plain-manager@example.com',
        notificationPreferences: {
          refused_registrations: { frequency: 'Daily Summary', method: 'email' },
        },
      })

      emailAdapter.clearCapturedEmails()
      const now = new Date(Date.now() + 1000)
      const output = await runDigests(now)
      const { totalDocs: total } = await payload.count({
        collection: 'registration-refusals',
        overrideAccess: true,
      })

      const sent = emailsTo('daily-admin@example.com')
      expect(sent).toHaveLength(1)
      expect(String(sent[0].subject)).toBe(`Refused sign-ups: ${total}`)
      const html = String(sent[0].html)
      expect(html).toContain('Digest Class')
      expect(html).toContain('The captcha check failed')
      expect(html).toContain('Quiet Visitor')
      expect(html).toContain('quiet-visitor@example.com')
      expect(String(sent[0].text)).toContain(`2× The captcha check failed`)

      expect(emailsTo('unset-admin@example.com')).toHaveLength(1)
      expect(emailsTo('muted-admin@example.com')).toHaveLength(0)
      expect(emailsTo('plain-manager@example.com')).toHaveLength(0)
      expect(output).toMatchObject({ eligibleAdmins: 2, digestsSent: 2, failed: 0 })

      // The watermark: the same refusals are never sent twice.
      emailAdapter.clearCapturedEmails()
      await runDigests(new Date(now.getTime() + 1000))
      expect(emailsTo('daily-admin@example.com')).toHaveLength(0)
    })

    it('sends a weekly digest on the Monday run only', async () => {
      const eventId = await createEvent('Weekly Class')
      await refuseAtRequest(registration(eventId))
      await testData.createManager(payload, {
        type: 'admin',
        name: 'Weekly Admin',
        email: 'weekly-admin@example.com',
        notificationPreferences: {
          refused_registrations: { frequency: 'Weekly Summary', method: 'email' },
        },
      })

      const monday = mondayOnOrAfter(new Date(Date.now() + 1000))
      const tuesday = new Date(monday.getTime() + 24 * 60 * 60 * 1000)

      emailAdapter.clearCapturedEmails()
      await runDigests(tuesday)
      expect(emailsTo('weekly-admin@example.com')).toHaveLength(0)

      await runDigests(monday)
      const sent = emailsTo('weekly-admin@example.com')
      expect(sent).toHaveLength(1)
      expect(String(sent[0].html)).toContain('Weekly Class')
      expect(String(sent[0].html)).toContain('in the last week')
    })
  })

  describe('retention', () => {
    it('sweeps a refusal past its window and keeps a recent one', async () => {
      const eventId = await createEvent('Retention Class')
      await refuseAtRequest(registration(eventId))
      await refuseAtRequest(registration(eventId))
      const [old, recent] = await refusalsFor(eventId)
      const now = new Date()
      await payload.db.updateOne({
        collection: 'registration-refusals',
        id: old.id,
        data: { createdAt: new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString() },
        req: undefined,
      })

      const output = await runTaskHandler(CleanupCollections, {
        payload,
        input: { now: now.toISOString(), collection: 'registration-refusals' },
      })

      expect(deletedIn(output, 'registration-refusals')).toBe(1)
      expect((await refusalsFor(eventId)).map((row) => row.id)).toEqual([recent.id])
    })
  })
})
