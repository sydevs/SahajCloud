/**
 * The registration eligibility gate on the unified create path (#797).
 *
 * `POST /api/user-submissions` with `type: registration` used to be accepted
 * unconditionally — the gates hung off `POST /api/events/{id}/register` and
 * nothing moved them. These cases pin what `gateRegistration` refuses, the
 * machine-readable `code` it refuses with, and the three things it must NOT
 * refuse: a create with no event, a manager's own write, and an import.
 *
 * A sibling file rather than a suite inside `user-submissions-create.int.spec.ts`,
 * because `getPayload` caches per config: a second `createTestEnvironment()` in
 * one file returns the FIRST instance (see `tests/AGENTS.md`).
 */
import type { Payload, PayloadRequest } from 'payload'

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Client, Event, Manager, UserSubmission } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

const VALID_TURNSTILE = { 'x-turnstile-token': 'tok-valid' }

/** A one-off event well in the future, so `shouldFinish` says nothing. */
const FUTURE_ONE_OFF = {
  firstDate: '2027-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
} as const

/** A one-off event whose only occurrence is long past. */
const PAST_ONE_OFF = {
  firstDate: '2020-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
} as const

describe('registration gate on the unified create (#797)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let client: Client

  const clientReq = (): PayloadRequest =>
    ({
      payload,
      headers: new Headers(VALID_TURNSTILE),
      user: { ...client, collection: 'clients' },
      context: {},
    }) as unknown as PayloadRequest

  /** Register as the Atlas widget does — a real client, real access. */
  const register = (data: Record<string, unknown>) =>
    payload.create({
      collection: 'user-submissions',
      data: {
        type: 'registration',
        senderEmail: `registrant-${randomUUID().slice(0, 8)}@example.com`,
        ...data,
      } as never,
      overrideAccess: false,
      req: clientReq(),
    }) as Promise<UserSubmission>

  const createEvent = async (overrides: Record<string, unknown> = {}): Promise<Event> => {
    const event = await testData.createEvent(payload, {
      manager: manager.id,
      registrationMode: 'sahaj-atlas',
      schedule: FUTURE_ONE_OFF,
      _status: 'published',
      ...overrides,
    })
    // `createEvent` runs the verify hook, which can move `_status`; pin the
    // published state the client read depends on.
    return payload.update({
      collection: 'events',
      id: event.id,
      data: { _status: 'published' },
      context: { skipVerifyHook: true },
      overrideAccess: true,
    }) as Promise<Event>
  }

  /** A seat taken, written past the gate so the fixture cannot fail on itself. */
  const takeSeat = (eventId: number) =>
    payload.create({
      collection: 'user-submissions',
      data: createData<'user-submissions'>({
        type: 'registration',
        event: eventId,
        senderEmail: `seat-${randomUUID().slice(0, 8)}@example.com`,
      } as never),
      overrideAccess: true,
    })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    verifyMock.mockResolvedValue({ success: true })

    manager = await testData.createManager(payload, {
      name: 'Gate Admin',
      email: 'gate-admin@example.com',
    })
    client = await testData.createClient(payload, manager.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('refuses a full event with 409 event_full, and writes no row', async () => {
    const event = await createEvent({ registrationLimit: 1 })
    await takeSeat(event.id)

    await expect(register({ event: event.id })).rejects.toMatchObject({
      status: 409,
      data: { code: 'event_full' },
    })

    const { totalDocs } = await payload.count({
      collection: 'user-submissions',
      where: { event: { equals: event.id } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(1)
  })

  it('refuses an external-mode event with external_registration', async () => {
    const event = await createEvent({ registrationMode: 'external' })
    await expect(register({ event: event.id })).rejects.toMatchObject({
      status: 409,
      data: { code: 'external_registration' },
    })
  })

  it('refuses an ended event with event_ended', async () => {
    // ⚠ `inactive: false` is load-bearing. `shouldFinish` exempts a dormant
    // listing by design, and the shared fixture creates one — so an "ended"
    // event left inactive never finishes and the case would pass vacuously.
    const event = await createEvent({ schedule: PAST_ONE_OFF, inactive: false })
    await expect(register({ event: event.id })).rejects.toMatchObject({
      status: 409,
      data: { code: 'event_ended' },
    })
  })

  it('answers 404, not 409, for an event the client cannot read', async () => {
    // The distinction is what `overrideAccess: false` on the gate's own read
    // buys: an unreadable event is *absent*, an ended one is found and refused.
    const draft = await createEvent()
    await payload.update({
      collection: 'events',
      id: draft.id,
      data: { _status: 'draft' },
      context: { skipVerifyHook: true },
      overrideAccess: true,
    })

    await expect(register({ event: draft.id })).rejects.toMatchObject({ status: 404 })
  })

  it('accepts a registration carrying no event', async () => {
    // `event` is deliberately not required on a registration row — one may be
    // recorded before its occurrence is resolved. Nothing to gate.
    const row = await register({})
    expect(row.type).toBe('registration')
    expect(row.uuid).toBeTruthy()
  })

  it('returns the document with its uuid synchronously on an open event', async () => {
    const event = await createEvent({ registrationLimit: 5 })
    const row = await register({ event: event.id })
    expect(row.uuid).toBeTruthy()
  })

  it('a spam-flagged row frees its seat', async () => {
    const event = await createEvent({ registrationLimit: 1 })
    const seat = await takeSeat(event.id)

    await expect(register({ event: event.id })).rejects.toMatchObject({
      data: { code: 'event_full' },
    })

    await payload.update({
      collection: 'user-submissions',
      id: seat.id,
      data: { status: 'spam' },
      overrideAccess: true,
    })

    await expect(register({ event: event.id })).resolves.toMatchObject({ type: 'registration' })
  })

  it('does not gate a write that is not a client’s', async () => {
    // A manager recording a registration on a full event by hand is a
    // deliberate act, not an attempt to slip past a limit.
    const event = await createEvent({ registrationLimit: 1 })
    await takeSeat(event.id)

    await expect(takeSeat(event.id)).resolves.toMatchObject({ type: 'registration' })
  })

  it('does not gate a Local API import, which carries no client user', async () => {
    // Historical Atlas rows sit on ended and external-mode events, and the
    // importer (#799) has to get past all four refusals. The "not a client"
    // condition above is the whole of its exemption — there is no context flag
    // to set, and nothing here may manufacture a client user to need one.
    const event = await createEvent({ schedule: PAST_ONE_OFF, inactive: false })

    await expect(
      payload.create({
        collection: 'user-submissions',
        data: {
          type: 'registration',
          senderEmail: `importer-${randomUUID().slice(0, 8)}@example.com`,
          event: event.id,
        } as never,
        overrideAccess: true,
      }),
    ).resolves.toMatchObject({ type: 'registration' })
  })
})
