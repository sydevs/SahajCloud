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

import { refusalHour } from '@/collections/RegistrationRefusals/RegistrationRefusals'
import { CleanupCollections } from '@/jobs/CleanupCollections/CleanupCollections'
import { SendRefusedRegistrationDigests } from '@/jobs/RegistrationNotifications/SendRefusedRegistrationDigests'
import { VERDICT_NOTES } from '@/jobs/ScreenSubmissions/verdicts'
import type { Client, Manager, RegistrationRefusal, UserSubmission } from '@/payload-types'

import { deletedIn } from '../utils/retention'
import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
import { createTestEnvironmentWithEmail } from '../utils/testHelpers'

const { verifyMock, mxMock } = vi.hoisted(() => ({ verifyMock: vi.fn(), mxMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({ verifyTurnstileToken: verifyMock }))
vi.mock('@/lib/antiSpam/mxRecords', () => ({ hasMxRecords: mxMock }))

const { ScreenSubmissions } = await import('@/jobs/ScreenSubmissions/ScreenSubmissions')

const HOUR_MS = 60 * 60 * 1000

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

  async function createEvent(
    title: string,
    status: 'draft' | 'published' = 'published',
  ): Promise<number> {
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
        _status: status,
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
    vi.restoreAllMocks()
  })

  /** The start of the hour after this one: the first moment a digest reads this hour's counts. */
  const nextHour = () => new Date(refusalHour(new Date()).getTime() + HOUR_MS)

  /** Admins that earlier cases left behind would otherwise receive this case's digest too. */
  const createAdmin = (email: string, frequency: string | null) =>
    testData.createManager(payload, {
      type: 'admin',
      name: email,
      email,
      notificationPreferences:
        frequency === null
          ? {}
          : {
              refused_registrations: {
                frequency,
                method: frequency === 'Never' ? '' : 'email',
              },
            },
    })

  const screenAsSpam = async (eventId: number, name: string, email: string) => {
    const submission = (await payload.create({
      collection: 'user-submissions',
      data: createData<'user-submissions'>({
        type: 'registration',
        event: eventId,
        senderEmail: email,
        submissionData: [{ field: 'name', value: name }],
      }),
      overrideAccess: true,
    })) as UserSubmission
    mxMock.mockResolvedValue(false)
    await runTaskHandler(ScreenSubmissions, { payload, input: { submissionId: submission.id } })
    return submission
  }

  describe('recording a refusal at the form', () => {
    it('counts the class, reason and hour, and keeps nothing the visitor typed', async () => {
      const eventId = await createEvent('Captcha Class')
      await refuseAtRequest(registration(eventId))
      await refuseAtRequest(registration(eventId))
      await refuseAtRequest(registration(eventId))

      const rows = await refusalsFor(eventId)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        event: eventId,
        stage: 'request',
        reason: 'captcha_failed',
        count: 3,
        hour: refusalHour(new Date()).toISOString(),
      })
      expect(rows[0].submission ?? null).toBeNull()

      // No row anywhere carries the refused visitors' addresses.
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

    it('records nothing for another type, a class nobody can sign up for, or a manager', async () => {
      const eventId = await createEvent('Quiet Class')
      const draftId = await createEvent('Draft Class', 'draft')

      await refuseAtRequest({ ...registration(eventId), type: 'contact' })
      await refuseAtRequest(registration(2_000_000_000))
      await refuseAtRequest(registration(draftId))

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
      expect(await refusalsFor(draftId)).toHaveLength(0)
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
      const submission = await screenAsSpam(eventId, 'Nomail Person', 'nomail@example.com')
      // A retry finds the row settled and records nothing more.
      await runTaskHandler(ScreenSubmissions, { payload, input: { submissionId: submission.id } })

      expect(await refusalsFor(eventId)).toEqual([
        expect.objectContaining({
          stage: 'screening',
          reason: 'no_mx_records',
          count: 1,
          submission: submission.id,
        }),
      ])
    })

    it('leaves the row unscreened when the refusal cannot be recorded, so a retry records it', async () => {
      const eventId = await createEvent('Retried Class')
      const submission = (await payload.create({
        collection: 'user-submissions',
        data: createData<'user-submissions'>({
          type: 'registration',
          event: eventId,
          senderEmail: 'retried@example.com',
          submissionData: [{ field: 'name', value: 'Retried Person' }],
        }),
        overrideAccess: true,
      })) as UserSubmission
      mxMock.mockResolvedValue(false)

      const create = payload.create.bind(payload)
      const spy = vi.spyOn(payload, 'create').mockImplementationOnce((async (args: never) => {
        if ((args as { collection: string }).collection === 'registration-refusals') {
          throw new Error('the refusal insert failed')
        }
        return create(args)
      }) as never)

      await expect(
        runTaskHandler(ScreenSubmissions, { payload, input: { submissionId: submission.id } }),
      ).rejects.toThrow('the refusal insert failed')
      spy.mockRestore()

      const reloaded = (await payload.findByID({
        collection: 'user-submissions',
        id: submission.id,
        depth: 0,
        overrideAccess: true,
      })) as UserSubmission
      expect(reloaded.status).toBe('pending')
      expect(await refusalsFor(eventId)).toHaveLength(0)

      await runTaskHandler(ScreenSubmissions, { payload, input: { submissionId: submission.id } })
      expect((await refusalsFor(eventId)).map((row) => row.submission)).toEqual([submission.id])
    })
  })

  describe('the digest', () => {
    it('reaches each admin at their cadence, and no one else', async () => {
      const eventId = await createEvent('Digest Class')
      await refuseAtRequest(registration(eventId))
      await refuseAtRequest(registration(eventId))
      await screenAsSpam(eventId, 'Quiet Visitor', 'quiet-visitor@example.com')

      await createAdmin('daily-admin@example.com', 'Daily Summary')
      // The migration wrote the default into every existing manager; one with
      // no key at all has chosen nothing, and is sent nothing, as for every type.
      await createAdmin('unset-admin@example.com', null)
      const muted = await createAdmin('muted-admin@example.com', 'Never')
      await testData.createManager(payload, {
        type: 'manager',
        name: 'Plain Manager',
        email: 'plain-manager@example.com',
        notificationPreferences: {
          refused_registrations: { frequency: 'Daily Summary', method: 'email' },
        },
      })

      // Still inside the hour: the screening refusal goes now, while the hour's
      // counts at the form are not complete, so they wait for the next run.
      emailAdapter.clearCapturedEmails()
      await runDigests(new Date(Date.now() + 1000))
      const [early] = emailsTo('daily-admin@example.com')
      expect(String(early?.html)).toContain('Quiet Visitor')
      expect(String(early?.html)).toContain('quiet-visitor@example.com')
      // The screening card says what the submission itself is annotated with,
      // so a second wording of the verdicts cannot drift back in.
      expect(String(early?.text)).toContain(
        `- Quiet Visitor — quiet-visitor@example.com: ${VERDICT_NOTES.no_mx_records as string}`,
      )

      emailAdapter.clearCapturedEmails()
      const now = nextHour()
      const output = await runDigests(now)

      const sent = emailsTo('daily-admin@example.com')
      expect(sent).toHaveLength(1)
      expect(String(sent[0].subject)).toBe(`Refused sign-ups: ${output.refusalsIncluded}`)
      const html = String(sent[0].html)
      expect(html).toContain('Digest Class')
      expect(html).toContain('The captcha check failed')
      expect(String(sent[0].text)).toContain('2× The captcha check failed')
      // The screening refusal went out in the earlier run, and is not repeated.
      expect(html).not.toContain('Quiet Visitor')

      expect(emailsTo('unset-admin@example.com')).toHaveLength(0)
      expect(emailsTo('muted-admin@example.com')).toHaveLength(0)
      expect(emailsTo('plain-manager@example.com')).toHaveLength(0)
      expect(output).toMatchObject({ eligibleAdmins: 1, digestsSent: 1, failed: 0 })

      // A muted admin's window moves on, so turning it back on starts today.
      const reloaded = (await payload.findByID({
        collection: 'managers',
        id: muted.id,
        depth: 0,
        overrideAccess: true,
      })) as Manager
      expect(reloaded.lastRefusedRegistrationDigestSentAt).toBe(now.toISOString())

      // The watermark: the same refusals are never sent twice.
      emailAdapter.clearCapturedEmails()
      await runDigests(new Date(now.getTime() + 1000))
      expect(emailsTo('daily-admin@example.com')).toHaveLength(0)
    })

    it('lists a screening refusal with who it was', async () => {
      const eventId = await createEvent('Listed Class')
      await screenAsSpam(eventId, 'Listed Visitor', 'listed-visitor@example.com')
      await createAdmin('listing-admin@example.com', 'Daily Summary')

      emailAdapter.clearCapturedEmails()
      await runDigests(new Date(Date.now() + 1000))

      const [sent] = emailsTo('listing-admin@example.com')
      expect(String(sent?.html)).toContain('Listed Visitor')
      expect(String(sent?.html)).toContain('listed-visitor@example.com')
    })

    it('sends a weekly digest on the Monday run only', async () => {
      const eventId = await createEvent('Weekly Class')
      await refuseAtRequest(registration(eventId))
      await createAdmin('weekly-admin@example.com', 'Weekly Summary')

      const monday = mondayOnOrAfter(nextHour())
      const tuesday = new Date(monday.getTime() + 24 * HOUR_MS)

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
      const [old] = await refusalsFor(eventId)
      const longAgo = new Date(Date.now() - 91 * 24 * HOUR_MS).toISOString()
      await payload.db.updateOne({
        collection: 'registration-refusals',
        id: old.id,
        data: { createdAt: longAgo, hour: longAgo },
        req: undefined,
      })
      await refuseAtRequest(registration(eventId))

      const output = await runTaskHandler(CleanupCollections, {
        payload,
        input: { now: new Date().toISOString(), collection: 'registration-refusals' },
      })

      expect(deletedIn(output, 'registration-refusals')).toBe(1)
      const remaining = await refusalsFor(eventId)
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).not.toBe(old.id)
    })
  })
})
