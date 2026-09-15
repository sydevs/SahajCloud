/**
 * The `purgeSubmissions` job (#724) — the per-type retention windows, and the
 * `users` orphan sweep that follows them.
 *
 * Rows are not aged by editing `createdAt`; the clock is moved instead. The
 * task takes an injected `now` for exactly this, so a case can assert a
 * ninety-day boundary without waiting for one, and the anchor is taken **after**
 * every create so each row's real `createdAt` provably precedes it.
 *
 * The windows' own invariants — the lower bound against the screening window,
 * that no window may ever select a `failed` row — are pinned without a database
 * in `tests/unit/submission-retention.spec.ts`. This file is about what the
 * sweep does.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PurgeSubmissions } from '@/jobs/PurgeSubmissions/PurgeSubmissions'
import {
  CONTACT_ACCEPTED_DAYS,
  MACHINE_SPAM_DAYS,
  PROPOSAL_DAYS,
} from '@/jobs/PurgeSubmissions/retention'
import type { Event, Form, Manager, UserSubmission } from '@/payload-types'

import { runTaskHandler } from '../utils/taskRunner'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const DAY_MS = 24 * 60 * 60 * 1000

describe('Submission retention sweep', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let event: Event
  let contactForm: Form
  let seedCounter = 0

  const systemReq = () =>
    ({
      payload,
      context: { skipWriteGuard: true },
      headers: new Headers(),
    }) as unknown as PayloadRequest

  /** Create a row and put it straight into the terminal state under test. */
  const seed = async (data: Record<string, unknown>): Promise<UserSubmission> => {
    const created = (await payload.create({
      collection: 'user-submissions',
      data: {
        type: 'contact',
        form: contactForm.id,
        // `message` is a contact key only, so the default is applied per type
        // rather than unconditionally — the allowed-key check refuses it on a
        // registration, which is that check working correctly.
        submissionData:
          (data.type ?? 'contact') === 'contact'
            ? [{ field: 'message', value: `Case ${(seedCounter += 1)}.` }]
            : [],
        ...data,
      } as never,
      overrideAccess: true,
      req: systemReq(),
    })) as UserSubmission

    // `status` and `screeningResult` are system-written, so they are set after
    // the create rather than through it — the same route the jobs take.
    if (data.status || data.screeningResult) {
      return (await payload.update({
        collection: 'user-submissions',
        id: created.id,
        data: {
          ...(data.status ? { status: data.status } : {}),
          ...(data.screeningResult ? { screeningResult: data.screeningResult } : {}),
        } as never,
        overrideAccess: true,
        req: systemReq(),
      })) as UserSubmission
    }

    return created
  }

  /** Run the sweep as if `days` had passed since `anchor`. */
  const sweep = (anchor: number, days: number, dryRun = false) =>
    runTaskHandler(PurgeSubmissions, {
      payload,
      input: { now: new Date(anchor + days * DAY_MS).toISOString(), dryRun },
    })

  const exists = async (collection: 'user-submissions' | 'users', id: number) => {
    const doc = await payload.findByID({
      collection,
      id,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    return doc != null
  }

  /** The `users` row a submission's sender was upserted into. */
  const userIdOf = (submission: UserSubmission): number => {
    const user = submission.user
    if (user == null) throw new Error('The fixture expected an upserted user and found none.')
    return typeof user === 'number' ? user : user.id
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    manager = await testData.createManager(payload, {
      name: 'Retention Admin',
      email: 'retention-admin@example.com',
    })
    event = await testData.createEvent(payload, { manager: manager.id })

    contactForm = (await payload.create({
      collection: 'forms',
      data: {
        title: 'Contact us',
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

  describe('the windows', () => {
    it('keeps a delivered contact row inside its window and deletes it past it', async () => {
      const row = await seed({ senderEmail: 'inside@example.com', status: 'accepted' })
      const anchor = Date.now()

      await sweep(anchor, CONTACT_ACCEPTED_DAYS - 1)
      expect(await exists('user-submissions', row.id)).toBe(true)

      await sweep(anchor, CONTACT_ACCEPTED_DAYS + 1)
      expect(await exists('user-submissions', row.id)).toBe(false)
    })

    /**
     * Refused rows are evidence: a sender's history is what makes a pattern
     * visible, so they outlast delivered mail by a long way.
     */
    it('keeps a refused row far longer than a delivered one', async () => {
      const row = await seed({
        senderEmail: 'refused@example.com',
        status: 'rejected',
        screeningResult: { verdict: 'disposable_email', screenedAt: new Date().toISOString() },
      })
      const anchor = Date.now()

      await sweep(anchor, CONTACT_ACCEPTED_DAYS + 1)
      expect(await exists('user-submissions', row.id)).toBe(true)

      await sweep(anchor, MACHINE_SPAM_DAYS + 1)
      expect(await exists('user-submissions', row.id)).toBe(false)
    })

    it('keeps a decided proposal for its own window', async () => {
      const row = await seed({
        type: 'proposal',
        form: undefined,
        senderEmail: 'proposer@example.com',
        proposed: { title: 'Thursday class' },
        status: 'accepted',
      })
      const anchor = Date.now()

      await sweep(anchor, PROPOSAL_DAYS - 1)
      expect(await exists('user-submissions', row.id)).toBe(true)

      await sweep(anchor, PROPOSAL_DAYS + 1)
      expect(await exists('user-submissions', row.id)).toBe(false)
    })

    /**
     * ⚠ A registration is an attendance record and a subscription is a consent
     * record. Deleting either would leave us holding something with nothing to
     * show for it, so neither has a window at all.
     */
    it('keeps a registration and a subscription forever', async () => {
      const registration = await seed({
        type: 'registration',
        form: undefined,
        event: event.id,
        senderEmail: 'attendee@example.com',
        status: 'accepted',
      })
      const subscription = await seed({
        type: 'subscribe',
        form: undefined,
        event: event.id,
        senderEmail: 'subscriber@example.com',
        status: 'accepted',
      })
      const anchor = Date.now()

      await sweep(anchor, MACHINE_SPAM_DAYS * 10)

      expect(await exists('user-submissions', registration.id)).toBe(true)
      expect(await exists('user-submissions', subscription.id)).toBe(true)
    })

    /**
     * ⚠ `failed` means we accepted a submission, told the person nothing, and
     * never delivered it — the one state where deleting the row destroys the
     * only record that anything went wrong.
     */
    it('never purges a failed row, however old', async () => {
      const row = await seed({ senderEmail: 'failed@example.com', status: 'failed' })
      const anchor = Date.now()

      await sweep(anchor, MACHINE_SPAM_DAYS * 10)

      expect(await exists('user-submissions', row.id)).toBe(true)
    })

    it('never purges a row still waiting on a decision', async () => {
      const row = await seed({ senderEmail: 'pending@example.com' })
      const anchor = Date.now()

      await sweep(anchor, MACHINE_SPAM_DAYS * 10)

      expect(await exists('user-submissions', row.id)).toBe(true)
    })
  })

  /**
   * The half that makes retention mean anything. Every submission upserts its
   * sender into `users`, so deleting the message while keeping the address
   * would leave the personal data behind and the promise unkept.
   */
  describe('the users orphan sweep', () => {
    it('takes the sender with the last message that referenced them', async () => {
      const row = await seed({ senderEmail: 'orphan@example.com', status: 'accepted' })
      const userId = userIdOf(row)
      const anchor = Date.now()

      expect(await exists('users', userId)).toBe(true)

      const { output } = { output: await sweep(anchor, CONTACT_ACCEPTED_DAYS + 1) }

      expect(await exists('user-submissions', row.id)).toBe(false)
      expect(await exists('users', userId)).toBe(false)
      expect(output.deletedUsers).toBeGreaterThanOrEqual(1)
    })

    /**
     * ⚠ The check is per user, not per type. Somebody who sent a message *and*
     * registered keeps their row when the message purges, because the
     * registration still names them.
     */
    it('keeps a sender a registration still points at', async () => {
      const email = 'pinned@example.com'
      const message = await seed({ senderEmail: email, status: 'accepted' })
      const registration = await seed({
        type: 'registration',
        form: undefined,
        event: event.id,
        senderEmail: email,
        status: 'accepted',
      })
      const userId = userIdOf(message)
      // The upsert is by normalized address, so both rows name one person —
      // which is the whole premise of the case.
      expect(userIdOf(registration)).toBe(userId)

      const anchor = Date.now()
      await sweep(anchor, CONTACT_ACCEPTED_DAYS + 1)

      expect(await exists('user-submissions', message.id)).toBe(false)
      expect(await exists('user-submissions', registration.id)).toBe(true)
      expect(await exists('users', userId)).toBe(true)
    })

    it('keeps a sender another message still points at', async () => {
      const email = 'two-messages@example.com'
      const old = await seed({ senderEmail: email, status: 'accepted' })
      const stillPending = await seed({ senderEmail: email })
      const userId = userIdOf(old)

      const anchor = Date.now()
      await sweep(anchor, CONTACT_ACCEPTED_DAYS + 1)

      expect(await exists('user-submissions', old.id)).toBe(false)
      expect(await exists('user-submissions', stillPending.id)).toBe(true)
      expect(await exists('users', userId)).toBe(true)
    })
  })

  describe('a dry run', () => {
    it('reports what would go and deletes nothing', async () => {
      const row = await seed({ senderEmail: 'dryrun@example.com', status: 'accepted' })
      const userId = userIdOf(row)
      const anchor = Date.now()

      const output = await sweep(anchor, CONTACT_ACCEPTED_DAYS + 1, true)

      expect(output.deletedSubmissions).toBeGreaterThanOrEqual(1)
      expect(output.deletedUsers).toBeGreaterThanOrEqual(1)
      expect(await exists('user-submissions', row.id)).toBe(true)
      expect(await exists('users', userId)).toBe(true)
    })
  })
})
