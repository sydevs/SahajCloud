/**
 * The `screenSubmission` job (#724) — the deep checks the request path cannot
 * afford, what they write, and what the pipeline does next.
 *
 * The task is invoked deterministically via `runTaskHandler` rather than
 * through the queue: `enqueueSubmissionScreening` suppresses its immediate kick
 * under `NODE_ENV === 'test'` precisely so specs can do this without a
 * background run racing their assertions.
 *
 * Two external dependencies are stubbed: the MX lookup, and `fetch` — the
 * latter because a subscribe row reaching a provider is one of the things these
 * specs must be able to prove did **not** happen.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { activeRegistrationWhere } from '@/lib/registrations/active'
import type { Event, Form, Manager, UserSubmission } from '@/payload-types'

import { runTaskHandler } from '../utils/taskRunner'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { mxMock } = vi.hoisted(() => ({ mxMock: vi.fn() }))

vi.mock('@/lib/antiSpam/mxRecords', () => ({ hasMxRecords: mxMock }))

// Imported after the mock so the job picks up the stub.
const { ScreenSubmissions } = await import('@/jobs/ScreenSubmissions/ScreenSubmissions')

describe('Submission screening', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let event: Event
  let contactForm: Form
  let fetchMock: ReturnType<typeof vi.fn>
  let seedCounter = 0

  /** A system `req`, so a spec can pin a starting state no client could post. */
  const systemReq = () =>
    ({ payload, context: { skipWriteGuard: true }, headers: new Headers() }) as unknown as PayloadRequest

  /**
   * Create a submission as the intake would. A DISTINCT body unless the case
   * names one — sharing a default would make the duplicate-body check fire
   * across unrelated cases, which is that check working correctly.
   */
  const seed = (data: Record<string, unknown> = {}) =>
    payload.create({
      collection: 'user-submissions',
      data: {
        type: 'contact',
        form: contactForm.id,
        senderEmail: 'visitor@example.com',
        submissionData: [{ field: 'message', value: `Case ${(seedCounter += 1)}.` }],
        ...data,
      } as never,
      overrideAccess: true,
      req: systemReq(),
    }) as Promise<UserSubmission>

  const screen = (submissionId: number) =>
    runTaskHandler(ScreenSubmissions, { payload, input: { submissionId } })

  const reload = (id: number) =>
    payload.findByID({
      collection: 'user-submissions',
      id,
      depth: 0,
      overrideAccess: true,
    }) as Promise<UserSubmission>

  /** Whether a delivery job is waiting for this row. */
  const deliveryQueued = async (submissionId: number) => {
    const { totalDocs } = await payload.count({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'deliverSubmission' } },
      overrideAccess: true,
    })
    if (totalDocs === 0) return false
    const { docs } = await payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'deliverSubmission' } },
      limit: 100,
      pagination: false,
      overrideAccess: true,
    })
    return docs.some(
      (job) => (job.input as { submissionId?: number } | undefined)?.submissionId === submissionId,
    )
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    manager = await testData.createManager(payload, {
      name: 'Screening Admin',
      email: 'screening-admin@example.com',
    })
    // A published client exists so the collection's provenance path has one to
    // resolve, even though these specs seed through the system req.
    await testData.createClient(payload, manager.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
    event = await testData.createEvent(payload, { manager: manager.id })

    contactForm = (await payload.create({
      collection: 'forms',
      data: {
        title: 'Report an issue',
        actionType: 'contact',
        recipient: manager.id,
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [
          { blockType: 'email', name: 'email', label: 'Email' },
          { blockType: 'textarea', name: 'message', label: 'Message' },
        ],
      } as never,
      overrideAccess: true,
    })) as Form
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    mxMock.mockReset()
    mxMock.mockResolvedValue(true)
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('a clean submission', () => {
    it('records the verdict, stays pending, and hands off to delivery', async () => {
      const submission = await seed()

      const output = await screen(submission.id)
      expect(output).toEqual({ verdict: 'ok', status: 'pending' })

      const row = await reload(submission.id)
      expect(row.screeningResult?.verdict).toBe('ok')
      expect(row.screeningResult?.screenedAt).toEqual(expect.any(String))
      // An accepted submission needs no explanation, so it carries no note.
      expect(row.screeningResult?.notes ?? []).toEqual([])
      // Delivery is what settles it — screening only refuses.
      expect(row.status).toBe('pending')
      expect(await deliveryQueued(submission.id)).toBe(true)
    })

    it('appends a screening entry to the activity log', async () => {
      const submission = await seed()
      await screen(submission.id)

      const log = (await reload(submission.id)).activityLog ?? []
      expect(log).toHaveLength(1)
      expect(log[0]).toEqual(
        expect.objectContaining({ type: 'screening', cells: { activity: 'Screening passed' } }),
      )
    })
  })

  describe('an address the checks refuse', () => {
    it('refuses a domain that publishes no mail servers, and delivers nothing', async () => {
      mxMock.mockResolvedValue(false)
      const submission = await seed({ senderEmail: 'nobody@no-mx.example.com' })

      const output = await screen(submission.id)
      expect(output).toEqual({ verdict: 'no_mx_records', status: 'rejected' })

      const row = await reload(submission.id)
      expect(row.status).toBe('rejected')
      expect(row.screeningResult?.notes?.[0]).toContain('no mail servers')
      expect(await deliveryQueued(submission.id)).toBe(false)
    })

    it('passes open on an inconclusive DNS lookup, keeping the reason for triage', async () => {
      // A resolver hiccup is a fact about our infrastructure, not the sender.
      mxMock.mockResolvedValue(null)
      const submission = await seed()

      await screen(submission.id)

      const row = await reload(submission.id)
      expect(row.screeningResult?.verdict).toBe('ok')
      expect(row.screeningResult?.diagnostic).toContain('inconclusive')
    })

    it('screens an anonymous submission by the checks that need no identity', async () => {
      const submission = await seed({ senderEmail: undefined })
      await expect(screen(submission.id)).resolves.toEqual({ verdict: 'ok', status: 'pending' })
      expect(mxMock).not.toHaveBeenCalled()
    })
  })

  /**
   * ⚠ The rule the whole design turns on. `status` folds a machine verdict and
   * a manager's decline into one `rejected`, so counting abuse off `status`
   * would make a manager's judgement a spam strike against the person who wrote
   * in — and enough of those would refuse their next genuine submission.
   */
  describe('abuse counting reads the verdict, never the status', () => {
    /** Six prior rows for one sender, all `rejected`, with the given verdict. */
    const seedHistory = async (email: string, verdict: string) => {
      for (let i = 0; i < 6; i += 1) {
        const row = await seed({ senderEmail: email })
        await payload.update({
          collection: 'user-submissions',
          id: row.id,
          data: {
            status: 'rejected',
            screeningResult: { verdict, screenedAt: new Date().toISOString() },
          } as never,
          overrideAccess: true,
          req: systemReq(),
        })
      }
    }

    it('refuses a sender the machine has refused repeatedly', async () => {
      const email = 'repeat@example.com'
      await seedHistory(email, 'disposable_email')

      const submission = await seed({ senderEmail: email })
      await expect(screen(submission.id)).resolves.toEqual({
        verdict: 'repeat_sender',
        status: 'rejected',
      })
    })

    it('does not refuse a sender a manager has merely declined', async () => {
      const email = 'declined@example.com'
      // Identical shape — six `rejected` rows — except screening passed each
      // one and a person said no afterwards.
      await seedHistory(email, 'ok')

      const submission = await seed({ senderEmail: email })
      await expect(screen(submission.id)).resolves.toEqual({ verdict: 'ok', status: 'pending' })
    })

    it('refuses a sender re-sending the same text', async () => {
      const email = 'duplicate@example.com'
      const body = [{ field: 'message', value: 'Exactly the same words every time.' }]
      const first = await seed({ senderEmail: email, submissionData: body })
      await screen(first.id)

      const second = await seed({ senderEmail: email, submissionData: body })
      await expect(screen(second.id)).resolves.toEqual({
        verdict: 'duplicate_body',
        status: 'rejected',
      })
    })
  })

  describe('a registration', () => {
    const seedRegistration = (data: Record<string, unknown> = {}) =>
      seed({
        type: 'registration',
        form: undefined,
        event: event.id,
        submissionData: [{ field: 'referral', value: `A friend ${(seedCounter += 1)}` }],
        ...data,
      })

    /**
     * ⚠ Flagged, never unwound. The row stands and so does any email already
     * sent — no job ever recalls an email. What `rejected` buys is the
     * exclusion below, and nothing else.
     */
    it('is flagged rather than deleted when screening refuses it', async () => {
      mxMock.mockResolvedValue(false)
      const submission = await seedRegistration({ senderEmail: 'spam@no-mx.example.com' })

      await screen(submission.id)

      const row = await reload(submission.id)
      expect(row.id).toBe(submission.id)
      expect(row.status).toBe('rejected')
      expect(row.event).toBe(event.id)
    })

    it('drops out of the reminder and fullness query once refused', async () => {
      // Each is screened while its own MX answer is in place — flipping the
      // stub before both runs would screen the "refused" row cleanly, and the
      // assertion below would then be about nothing.
      mxMock.mockResolvedValue(false)
      const refused = await seedRegistration({ senderEmail: 'refused@no-mx.example.com' })
      await screen(refused.id)

      mxMock.mockResolvedValue(true)
      const kept = await seedRegistration({ senderEmail: 'genuine@example.com' })
      await screen(kept.id)

      const { docs } = await payload.find({
        collection: 'user-submissions',
        where: { ...activeRegistrationWhere, event: { equals: event.id } },
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })

      const ids = docs.map((doc) => doc.id)
      expect(ids).toContain(kept.id)
      expect(ids).not.toContain(refused.id)
    })

    /**
     * The consent record is a real row with its own status, screening and
     * retries — not the timestamp it replaces, which recorded that somebody had
     * consented and delivered nothing.
     */
    it('spawns a linked subscribe row when the registrant opts in', async () => {
      const submission = await seedRegistration({
        senderEmail: 'optin@example.com',
        submissionData: [
          { field: 'name', value: 'Ada' },
          { field: 'locale', value: 'en' },
          { field: 'subscribe', value: 'true' },
        ],
      })

      const { docs } = await payload.find({
        collection: 'user-submissions',
        where: { type: { equals: 'subscribe' }, senderEmail: { equals: 'optin@example.com' } },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      })

      expect(docs).toHaveLength(1)
      // `event` is the link back to the registration that created it, and what
      // exempts the row from needing a form of its own.
      expect(docs[0]?.event).toBe(event.id)
      expect(docs[0]?.status).toBe('pending')
      // `payload.create` returns relationships populated, so compare the ids.
      const userId = (value: unknown) =>
        typeof value === 'object' && value !== null ? (value as { id: number }).id : value
      expect(userId(docs[0]?.user)).toBe(userId(submission.user))
    })

    it('spawns nothing when the box was not ticked', async () => {
      await seedRegistration({ senderEmail: 'no-optin@example.com' })

      const { totalDocs } = await payload.count({
        collection: 'user-submissions',
        where: { type: { equals: 'subscribe' }, senderEmail: { equals: 'no-optin@example.com' } },
        overrideAccess: true,
      })
      expect(totalDocs).toBe(0)
    })
  })

  /**
   * A list's quota and a sender's reputation are spent on every address pushed
   * to it, so a throwaway address must never reach the provider. That is the
   * whole reason delivery is a separate task queued only after a clean verdict.
   */
  it('never lets a refused subscribe row reach a provider', async () => {
    mxMock.mockResolvedValue(false)
    const submission = await seed({
      type: 'subscribe',
      form: undefined,
      event: event.id,
      senderEmail: 'throwaway@no-mx.example.com',
      submissionData: [],
    })

    await screen(submission.id)

    expect((await reload(submission.id)).status).toBe('rejected')
    expect(await deliveryQueued(submission.id)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  describe('a proposal', () => {
    const seedProposal = (proposed: Record<string, unknown>) =>
      seed({
        type: 'proposal',
        form: undefined,
        senderEmail: `proposer${(seedCounter += 1)}@example.com`,
        proposed,
        submissionData: [{ field: 'note', value: `Proposal ${seedCounter}` }],
      })

    /**
     * The gap this closes: `prepareUserSubmission` URL-scans `submissionData`,
     * and `proposed` is a separate column it never sees — so a submitter
     * refused a link in their note could still put one in the event title a
     * manager then reads in the review email.
     */
    it('refuses a link inside the proposed patch, which no create-time scan sees', async () => {
      const submission = await seedProposal({ title: 'Free class at buy-now.example.com' })

      await expect(screen(submission.id)).resolves.toEqual({
        verdict: 'content_rejected',
        status: 'rejected',
      })
      expect((await reload(submission.id)).screeningResult?.diagnostic).toContain('title')
    })

    it('passes an ordinary proposal', async () => {
      const submission = await seedProposal({ title: 'Thursday evening class' })
      await expect(screen(submission.id)).resolves.toEqual({ verdict: 'ok', status: 'pending' })
    })
  })

  describe('idempotence', () => {
    /**
     * Screening is idempotent by refusing to run twice, not by reaching the
     * same answer twice: the history counts move underneath it, so a second run
     * could reach a *different* verdict on the same row.
     */
    it('does not re-screen a row that already carries a verdict', async () => {
      const submission = await seed()
      await screen(submission.id)
      const first = (await reload(submission.id)).screeningResult

      mxMock.mockResolvedValue(false)
      await screen(submission.id)

      expect((await reload(submission.id)).screeningResult).toEqual(first)
    })

    it('leaves a row a manager has already settled alone', async () => {
      const submission = await seed()
      await payload.update({
        collection: 'user-submissions',
        id: submission.id,
        data: { status: 'accepted' } as never,
        overrideAccess: true,
        req: systemReq(),
      })

      await screen(submission.id)

      const row = await reload(submission.id)
      expect(row.status).toBe('accepted')
      expect(row.screeningResult).toBeFalsy()
    })
  })
})
