/**
 * Integration tests for registrant confirm/deny voting on unverified events:
 * uuid-possession access on the built-in Registrations update, the client
 * field whitelist, the vote gate, the community-feedback sync (Wilson score +
 * denied threshold), and the post-event follow-up job.
 */
import type { Payload, PayloadRequest } from 'payload'

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'


import { SendPostEventFollowUps } from '@/jobs/RegistrationNotifications/SendPostEventFollowUps'
import { readCommunityFeedback } from '@/lib/eventVerification/communityFeedback'
import type { Event, Manager, Registration } from '@/payload-types'

import { runTaskHandler } from '../utils/taskRunner'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('Event feedback (registrant voting)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    manager = await testData.createManager(payload, { email: 'feedback-manager@example.com' })
  })

  afterAll(async () => {
    await cleanup()
  })

  /** A published, managerless, unverified event — the votable state. */
  async function createUnverifiedEvent(): Promise<Event> {
    const event = await testData.createEvent(payload, {
      manager: null,
      verificationStage: 'unverified',
      _status: 'published',
    })
    return payload.update({
      collection: 'events',
      id: event.id,
      data: { verificationStage: 'unverified', _status: 'published' },
      context: { skipVerifyHook: true },
      overrideAccess: true,
    }) as Promise<Event>
  }

  async function createRegistration(
    eventId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<Registration> {
    const user = await payload.create({
      collection: 'users',
      data: {
        name: 'Voter',
        email: `voter-${randomUUID().slice(0, 8)}@example.com`,
      },
      overrideAccess: true,
    })
    return payload.create({
      collection: 'registrations',
      data: {
        event: eventId,
        user: user.id,
        uuid: randomUUID(),
        ...overrides,
      } as never,
      overrideAccess: true,
    }) as Promise<Registration>
  }

  /** The Atlas widget's shape: a client user + the uuid it proves it holds. */
  const clientReq = (registrationUuid?: string) =>
    ({
      payload,
      headers: new Headers(),
      user: {
        id: 4242,
        collection: 'clients',
        _status: 'published',
        roles: ['sahaj-atlas-client'],
      },
      // Both, as `createPayloadRequest` sets them on a real REST request —
      // the fixture used to set only `query`, which is why it could not tell
      // that the access helper's `searchParams` fallback was unreachable.
      query: registrationUuid ? { registrationUuid } : {},
      searchParams: new URLSearchParams(registrationUuid ? { registrationUuid } : {}),
      context: {},
    }) as unknown as PayloadRequest

  const voteAsClient = (registration: Registration, vote: 'confirmed' | 'denied', uuid?: string) =>
    payload.update({
      collection: 'registrations',
      id: registration.id,
      data: { eventFeedback: vote } as never,
      overrideAccess: false,
      req: clientReq(uuid ?? registration.uuid),
    })

  const reloadEvent = (id: number) =>
    payload.findByID({
      collection: 'events',
      id,
      depth: 0,
      overrideAccess: true,
      draft: true,
    }) as Promise<Event>

  describe('uuid-possession access (built-in update)', () => {
    it('records a vote when the request proves the registration uuid', async () => {
      const event = await createUnverifiedEvent()
      const registration = await createRegistration(event.id)

      const updated = await voteAsClient(registration, 'confirmed')
      expect(updated.eventFeedback).toBe('confirmed')
    })

    it('refuses a vote with a wrong or missing uuid', async () => {
      const event = await createUnverifiedEvent()
      const registration = await createRegistration(event.id)

      await expect(voteAsClient(registration, 'confirmed', randomUUID())).rejects.toThrow()
      await expect(
        payload.update({
          collection: 'registrations',
          id: registration.id,
          data: { eventFeedback: 'confirmed' } as never,
          overrideAccess: false,
          req: clientReq(undefined),
        }),
      ).rejects.toThrow()
    })

    it('whitelists the client patch to eventFeedback only', async () => {
      const event = await createUnverifiedEvent()
      const registration = await createRegistration(event.id, {
        questions: { experience: 'None yet' },
      })

      await payload.update({
        collection: 'registrations',
        id: registration.id,
        data: { eventFeedback: 'confirmed', questions: { experience: 'FORGED' } } as never,
        overrideAccess: false,
        req: clientReq(registration.uuid),
      })

      const after = (await payload.findByID({
        collection: 'registrations',
        id: registration.id,
        depth: 0,
        overrideAccess: true,
      })) as Registration
      expect(after.eventFeedback).toBe('confirmed')
      expect((after.questions as { experience?: string })?.experience).toBe('None yet')
    })
  })

  describe('vote gate', () => {
    it('refuses feedback once the event is verified (adopted)', async () => {
      const event = await createUnverifiedEvent()
      const registration = await createRegistration(event.id)
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { manager: manager.id }, // adoption → verified
        overrideAccess: true,
      })

      await expect(voteAsClient(registration, 'denied')).rejects.toMatchObject({
        status: 409,
        data: { code: 'feedback_closed' },
      })
    })

    it('refuses a vote once the event is trashed', async () => {
      // A trashed event is invisible to the gate's lookup, so it refuses like
      // any closed listing. Previously untested, and worth pinning: withdrawing
      // a listing has to stop the votes that decide whether it stays down.
      const event = await createUnverifiedEvent()
      const registration = await createRegistration(event.id)
      await payload.update({
        collection: 'events',
        id: event.id,
        data: { deletedAt: new Date().toISOString() },
        overrideAccess: true,
      })

      await expect(voteAsClient(registration, 'confirmed')).rejects.toMatchObject({
        status: 409,
        data: { code: 'feedback_closed' },
      })
    })
  })

  describe('community-feedback sync', () => {
    it('stores the Wilson score + tallies on the event as votes land', async () => {
      const event = await createUnverifiedEvent()
      const first = await createRegistration(event.id)
      const second = await createRegistration(event.id)

      await voteAsClient(first, 'confirmed')
      await voteAsClient(second, 'denied')

      const after = await reloadEvent(event.id)
      const feedback = readCommunityFeedback(after.systemMeta)
      expect(feedback).toMatchObject({ confirmations: 1, denials: 1 })
      expect(after.confidenceScore).toBeGreaterThan(0)
      expect(after.confidenceScore).toBeLessThan(1)
      expect(after.verificationStage).toBe('unverified')
    })

    it('flips to denied + draft at ≥5 denials with a low upper bound', async () => {
      const event = await createUnverifiedEvent()
      // Sequential on purpose: parallel creates contend on the event row
      // (fullness + feedback sync hooks) and can deadlock in Postgres.
      for (let i = 0; i < 5; i++) {
        const registration = await createRegistration(event.id)
        await voteAsClient(registration, 'denied')
      }

      const after = await reloadEvent(event.id)
      expect(after.verificationStage).toBe('denied')
      expect(after._status).toBe('draft')
      expect(readCommunityFeedback(after.systemMeta)).toMatchObject({
        confirmations: 0,
        denials: 5,
      })
    })

    it('keeps a mixed verdict published: 5 denials + 1 confirmation is not conclusive', async () => {
      const event = await createUnverifiedEvent()
      const confirmer = await createRegistration(event.id)
      await voteAsClient(confirmer, 'confirmed')
      for (let i = 0; i < 5; i++) {
        const registration = await createRegistration(event.id)
        await voteAsClient(registration, 'denied')
      }

      // wilson(1, 6).right ≈ 0.56 — the optimistic read still clears 0.5.
      const after = await reloadEvent(event.id)
      expect(after.verificationStage).toBe('unverified')
      expect(after._status).toBe('published')
    })

    it('a re-vote recounts rather than double-counts', async () => {
      const event = await createUnverifiedEvent()
      const registration = await createRegistration(event.id)

      await voteAsClient(registration, 'denied')
      await voteAsClient(registration, 'confirmed')

      const after = await reloadEvent(event.id)
      expect(readCommunityFeedback(after.systemMeta)).toMatchObject({
        confirmations: 1,
        denials: 0,
      })
    })
  })

  describe('post-event follow-up job', () => {
    let sendEmail: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      sendEmail = vi.spyOn(payload, 'sendEmail').mockResolvedValue(undefined as never)
      sendEmail.mockClear()
    })

    const runJob = (runStart: Date) =>
      runTaskHandler(SendPostEventFollowUps, {
        payload,
        context: { runStart: runStart.toISOString() },
      })

    it('asks registrants of an elapsed unverified event exactly once', async () => {
      const event = await createUnverifiedEvent()
      const registration = await createRegistration(event.id, {
        startingAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      })
      // Capture the clock AFTER setup so createdAt/startingAt sit inside the window.
      const runStart = new Date()

      const first = await runJob(runStart)
      expect(first.sent).toBeGreaterThanOrEqual(1)

      const message = sendEmail.mock.calls.at(-1)?.[0] as { to: string; html: string }
      expect(message.html).toContain('/registrations/feedback?token=')

      const after = (await payload.findByID({
        collection: 'registrations',
        id: registration.id,
        depth: 0,
        overrideAccess: true,
      })) as Registration
      expect(after.followUpSentAt).toBeTruthy()

      sendEmail.mockClear()
      const second = await runJob(new Date())
      expect(second.sent).toBe(0)
      expect(sendEmail).not.toHaveBeenCalled()
    })

    it('skips registrations for verified events (nothing to ask yet)', async () => {
      const event = await testData.createEvent(payload, {
        manager: manager.id,
        _status: 'published',
      })
      const registration = await createRegistration(event.id, {
        startingAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      })
      const runStart = new Date()

      await runJob(runStart)

      const after = (await payload.findByID({
        collection: 'registrations',
        id: registration.id,
        depth: 0,
        overrideAccess: true,
      })) as Registration
      // No send, and the ledger stays open for future follow-up types.
      expect(after.followUpSentAt ?? null).toBeNull()
    })
  })
})
