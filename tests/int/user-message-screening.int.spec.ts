/**
 * Integration tests for the `screenUserMessage` job (#632) — the deep checks the
 * request path can't afford, and the delivery that follows them.
 *
 * The task is invoked deterministically via `runTaskHandler` rather than through
 * the queue: the collection's `afterChange` hook suppresses its immediate kick
 * under `NODE_ENV === 'test'` precisely so specs can do this without a
 * background run racing their assertions.
 *
 * Two external dependencies are stubbed: the MX lookup (this job's own copy) and
 * the mailer (`payload.sendEmail` spy).
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UserMessageScreeningResult } from '@/collections/UserMessages/screening'
import type { Client, Manager, UserMessage } from '@/payload-types'

import { runTaskHandler } from '../utils/taskRunner'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { mxMock } = vi.hoisted(() => ({ mxMock: vi.fn() }))

vi.mock('@/jobs/ScreenUserMessages/emailChecks', () => ({
  hasMxRecords: mxMock,
}))

// Imported after the mock so the job picks up the stub.
const { ScreenUserMessages } = await import('@/jobs/ScreenUserMessages/ScreenUserMessages')

const MESSAGE = 'The venue for this class closed last month.'

describe('User message screening', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let client: Client
  let sendEmail: ReturnType<typeof vi.spyOn>
  let seedCounter = 0

  /**
   * Create a message as the client would. `overrideAccess: true` here because
   * these specs are about the JOB — the access boundary is pinned next door in
   * `user-messages.int.spec.ts`, and the override lets a case pin a starting
   * state (a `failed` row) that a client could never post.
   */
  const seed = (data: Record<string, unknown> = {}) =>
    payload.create({
      collection: 'user-messages',
      // A DISTINCT body unless the case names one. Sharing a default would make
      // the duplicate-body check fire across unrelated cases — which is exactly
      // what happened while writing these, and is the check working correctly.
      data: { message: `${MESSAGE} Case ${(seedCounter += 1)}.`, client: client.id, ...data } as never,
      overrideAccess: true,
      req: { payload, context: { skipWriteGuard: true } } as unknown as PayloadRequest,
    }) as Promise<UserMessage>

  const screen = (messageId: number) =>
    runTaskHandler(ScreenUserMessages, { payload, input: { messageId } })

  const reload = (id: number) =>
    payload.findByID({
      collection: 'user-messages',
      id,
      depth: 0,
      overrideAccess: true,
    }) as Promise<UserMessage>

  const verdictOf = (message: UserMessage) =>
    (message.screeningResult as UserMessageScreeningResult | null)?.verdict

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    manager = await testData.createManager(payload, {
      name: 'Screening Admin',
      email: 'screening-admin@example.com',
    })
    client = await testData.createClient(payload, manager.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
    sendEmail = vi.spyOn(payload, 'sendEmail').mockResolvedValue(undefined as never)
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    mxMock.mockReset().mockResolvedValue(true)
    // Creating the manager above sent a verification email; without this the
    // first `toHaveBeenCalledTimes(1)` would be off by one.
    sendEmail.mockClear()
  })

  describe('address checks', () => {
    it('files a disposable address as spam and delivers nothing', async () => {
      const message = await seed({ senderEmail: 'throwaway@mailinator.com' })
      const result = await screen(message.id)

      expect(result.status).toBe('spam')
      expect(verdictOf(await reload(message.id))).toBe('disposable_email')
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('files an address that cannot receive mail as spam', async () => {
      mxMock.mockResolvedValue(false)
      const message = await seed({ senderEmail: 'nobody@no-mx.example' })

      expect((await screen(message.id)).status).toBe('spam')
      expect(verdictOf(await reload(message.id))).toBe('no_mx_records')
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('passes open when the MX lookup is inconclusive, and says so for triage', async () => {
      // Availability beats strictness: a resolver hiccup must not trash a
      // genuine report. The fact is kept as a diagnostic, not a rendered note —
      // it is about our infrastructure and asks nothing of the admin.
      mxMock.mockResolvedValue(null)
      const message = await seed({ senderEmail: 'seeker@example.com' })

      expect((await screen(message.id)).status).toBe('delivered')
      const screened = (await reload(message.id)).screeningResult as UserMessageScreeningResult
      expect(screened.verdict).toBe('ok')
      expect(screened.diagnostic).toContain('MX lookup')
      expect(screened.notes ?? []).toHaveLength(0)
    })

    it('skips the address checks entirely for an anonymous message', async () => {
      const message = await seed({ message: 'Anonymous note about the map page.' })

      expect((await screen(message.id)).status).toBe('delivered')
      expect(mxMock).not.toHaveBeenCalled()
    })
  })

  describe('history checks', () => {
    it('files a sender past the repeat threshold as spam', async () => {
      const senderEmail = 'prolific@example.com'
      // The rule is *more than* REPEAT_SENDER_MAX (5) priors, so six priors are
      // seeded and the seventh message is the one that trips it. Every body is
      // distinct, so only the sender count can be firing.
      for (let i = 0; i < 6; i++) {
        await seed({ senderEmail, message: `${MESSAGE} Distinct body number ${i}.` })
      }
      const seventh = await seed({ senderEmail, message: `${MESSAGE} Distinct body seven.` })

      expect((await screen(seventh.id)).status).toBe('spam')
      expect(verdictOf(await reload(seventh.id))).toBe('repeat_sender')
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('leaves a sender below the threshold alone', async () => {
      const senderEmail = 'occasional@example.com'
      await seed({ senderEmail, message: `${MESSAGE} First distinct note.` })
      const second = await seed({ senderEmail, message: `${MESSAGE} Second distinct note.` })

      expect((await screen(second.id)).status).toBe('delivered')
    })

    it('files an exact repeat of a body as spam, whoever sent it', async () => {
      const body = 'Identical blast text used for the duplicate check.'
      await seed({ senderEmail: 'first@example.com', message: body })
      // A different sender, so this can only be the body check firing.
      const second = await seed({ senderEmail: 'second@example.com', message: body })

      expect((await screen(second.id)).status).toBe('spam')
      expect(verdictOf(await reload(second.id))).toBe('duplicate_body')
    })

    it('catches a duplicate body from an anonymous sender too', async () => {
      // The only check that covers an anonymous message — there is no identity
      // to count a repeat-sender window against.
      const body = 'Anonymous identical blast text, sent more than once.'
      await seed({ message: body })
      const second = await seed({ message: body })

      expect((await screen(second.id)).status).toBe('spam')
      expect(verdictOf(await reload(second.id))).toBe('duplicate_body')
    })
  })

  describe('delivery', () => {
    it('emails a clean message and stamps when it went', async () => {
      const message = await seed({
        senderEmail: 'seeker@example.com',
        subject: 'Issue report',
        context: { path: '/events/berlin', locale: 'de' },
      })

      expect((await screen(message.id)).status).toBe('delivered')

      expect(sendEmail).toHaveBeenCalledTimes(1)
      const sent = sendEmail.mock.calls[0][0] as { subject: string; replyTo?: string; html: string }
      // The client name comes off the authenticated key's row, not the body.
      expect(sent.subject).toBe('[Atlas Widget] Issue report')
      expect(sent.replyTo).toBe('seeker@example.com')
      expect(sent.html).toContain(MESSAGE)
      expect(sent.html).toContain('/events/berlin')

      const stored = await reload(message.id)
      expect(stored.status).toBe('delivered')
      expect(stored.deliveredAt).toBeTruthy()
    })

    it('is a no-op on a message that is already settled', async () => {
      const message = await seed({ senderEmail: 'seeker@example.com' })
      await screen(message.id)
      sendEmail.mockClear()

      // A retried job after a crash, or an admin who got there first.
      expect((await screen(message.id)).status).toBe('delivered')
      expect(sendEmail).not.toHaveBeenCalled()
    })
  })

  describe('a failed send', () => {
    it('marks the row failed and rethrows so the task retries', async () => {
      sendEmail.mockRejectedValueOnce(new Error('Resend 422'))
      const message = await seed({ senderEmail: 'seeker@example.com' })

      await expect(screen(message.id)).rejects.toThrow('Resend 422')

      // The write survives the throw: the job runner gives each task an
      // isolated transactionID, so the update commits on its own connection.
      // Without that, an undelivered message would sit in `screening` looking
      // untouched, and nobody would learn it never went.
      const stored = await reload(message.id)
      expect(stored.status).toBe('failed')
      expect((stored.screeningResult as UserMessageScreeningResult).diagnostic).toContain(
        'Resend 422',
      )
      expect(stored.deliveredAt).toBeFalsy()
    })

    it('re-attempts the send on retry and delivers', async () => {
      sendEmail.mockRejectedValueOnce(new Error('Resend 422'))
      const message = await seed({ senderEmail: 'seeker@example.com' })
      await expect(screen(message.id)).rejects.toThrow()

      // The retry the throw earned.
      expect((await screen(message.id)).status).toBe('delivered')
      expect((await reload(message.id)).deliveredAt).toBeTruthy()
    })

    it('re-screens rather than trusting a stored verdict it did not write', async () => {
      // `screeningResult` is a JSON column, so a bad write (or an older shape)
      // can leave a value outside the verdict union there. The guard asserts a
      // TYPE, so accepting anything string-shaped would propagate a lie; a row
      // we cannot read falls through to a fresh screening instead.
      const message = await seed({ senderEmail: 'throwaway@mailinator.com' })
      await payload.update({
        collection: 'user-messages',
        id: message.id,
        data: {
          status: 'failed',
          screeningResult: { verdict: 'something-we-never-wrote', screenedAt: 'whenever' },
        },
        overrideAccess: true,
        req: { payload, context: { skipWriteGuard: true } } as unknown as PayloadRequest,
      })

      // Re-screened from scratch, so the disposable address is caught.
      expect((await screen(message.id)).status).toBe('spam')
      expect(verdictOf(await reload(message.id))).toBe('disposable_email')
    })

    it('does not re-screen on retry — a transport failure cannot turn a message into spam', async () => {
      // The trap this guards: history has moved on by the time the retry runs.
      // Re-screening would count the *new* rows and could reach a different
      // verdict, so a mail outage would silently reclassify clean messages.
      const senderEmail = 'retry@example.com'
      sendEmail.mockRejectedValueOnce(new Error('Resend 422'))
      const message = await seed({ senderEmail, message: `${MESSAGE} Retry case.` })
      await expect(screen(message.id)).rejects.toThrow()

      // Push the sender well past the repeat threshold before retrying.
      for (let i = 0; i < 6; i++) {
        await seed({ senderEmail, message: `${MESSAGE} Filler ${i}.` })
      }

      expect((await screen(message.id)).status).toBe('delivered')
      expect(verdictOf(await reload(message.id))).toBe('ok')
    })
  })
})
