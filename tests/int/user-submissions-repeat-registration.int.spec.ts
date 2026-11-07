/**
 * A repeat signup updates the registration the sender already holds
 * (`mergeRepeatRegistration`), rather than adding a second row for one person.
 *
 * A sibling file for the reason `user-submissions-registration-gate.int.spec.ts`
 * gives: one `createTestEnvironment()` per file (`tests/AGENTS.md`).
 */
import type { Payload, PayloadRequest } from 'payload'

import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { asLog } from '@/fields'
import type { Client, Event, Manager, UserSubmission } from '@/payload-types'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

const FUTURE_WEEKLY = {
  firstDate: '2027-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
} as const

const SESSION_A = '2027-01-06T10:00:00.000Z'
const SESSION_B = '2027-01-13T10:00:00.000Z'

describe('a repeat registration updates the existing one', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let client: Client

  const clientReq = (): PayloadRequest =>
    ({
      payload,
      headers: new Headers({ 'x-turnstile-token': 'tok-valid' }),
      user: { ...client, collection: 'clients' },
      context: {},
    }) as unknown as PayloadRequest

  const register = (args: { event: number; email: string; name: string; startingAt?: string }) =>
    payload.create({
      collection: 'user-submissions',
      data: {
        type: 'registration',
        event: args.event,
        senderEmail: args.email,
        startingAt: args.startingAt,
        submissionData: [{ field: 'name', value: args.name }],
      } as never,
      overrideAccess: false,
      req: clientReq(),
    }) as Promise<UserSubmission>

  const registrationsOf = async (eventId: number) =>
    (
      await payload.find({
        collection: 'user-submissions',
        where: { and: [{ type: { equals: 'registration' } }, { event: { equals: eventId } }] },
        depth: 0,
        pagination: false,
        overrideAccess: true,
      })
    ).docs

  const createEvent = async (overrides: Record<string, unknown> = {}): Promise<Event> => {
    const event = await testData.createEvent(payload, {
      manager: manager.id,
      registrationMode: 'sahaj-atlas',
      schedule: FUTURE_WEEKLY,
      _status: 'published',
      ...overrides,
    })
    return payload.update({
      collection: 'events',
      id: event.id,
      data: { _status: 'published' },
      context: { skipVerifyHook: true },
      overrideAccess: true,
    }) as Promise<Event>
  }

  const email = () => `repeat-${randomUUID().slice(0, 8)}@example.com`

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    verifyMock.mockResolvedValue({ success: true })

    manager = await testData.createManager(payload, {
      name: 'Repeat Admin',
      email: 'repeat-admin@example.com',
    })
    client = await testData.createClient(payload, manager.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('updates the name and session on the same row, keeping its identity', async () => {
    const event = await createEvent()
    const address = email()

    const first = await register({
      event: event.id,
      email: address,
      name: 'Ann',
      startingAt: SESSION_A,
    })
    await payload.update({
      collection: 'user-submissions',
      id: first.id,
      data: { status: 'accepted' },
      overrideAccess: true,
    })

    // The case differs: the sender's `users` row is keyed on the normalized
    // address, so this is the same person.
    const second = await register({
      event: event.id,
      email: address.toUpperCase(),
      name: 'Ann Smith',
      startingAt: SESSION_B,
    })

    expect(second.id).toBe(first.id)
    expect(second.uuid).toBe(first.uuid)

    const rows = await registrationsOf(event.id)
    expect(rows).toHaveLength(1)
    const [row] = rows as UserSubmission[]
    expect(row!.id).toBe(first.id)
    expect(row!.uuid).toBe(first.uuid)
    expect(row!.createdAt).toBe(first.createdAt)
    expect(new Date(row!.startingAt!).toISOString()).toBe(SESSION_B)
    expect(row!.submissionData).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name', value: 'Ann Smith' })]),
    )
    // Back to `pending`, so the new answers are screened and re-confirmed.
    expect(row!.status).toBe('pending')
    expect(asLog(row!.activityLog).some((entry) => entry.type === 'registration-update')).toBe(true)

    // The screening queued by the repeat names the surviving row, never the
    // deleted one — which is what listing the merge first in `afterChange` buys.
    const { docs: jobs } = await payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'screenSubmission' } },
      pagination: false,
      overrideAccess: true,
    })
    const screened = jobs.map((job) => (job.input as { submissionId?: number }).submissionId)
    expect(screened.filter((id) => id === first.id)).toHaveLength(2)
    const { totalDocs: surviving } = await payload.count({
      collection: 'user-submissions',
      where: { id: { in: screened } },
      overrideAccess: true,
    })
    expect(surviving).toBe(new Set(screened).size)
  })

  it('keeps two people on one event as two rows', async () => {
    const event = await createEvent()
    await register({ event: event.id, email: email(), name: 'Ann' })
    await register({ event: event.id, email: email(), name: 'Bo' })

    expect(await registrationsOf(event.id)).toHaveLength(2)
  })

  it('keeps one person on two events as two rows', async () => {
    const [one, two] = [await createEvent(), await createEvent()]
    const address = email()
    await register({ event: one.id, email: address, name: 'Ann' })
    await register({ event: two.id, email: address, name: 'Ann' })

    expect(await registrationsOf(one.id)).toHaveLength(1)
    expect(await registrationsOf(two.id)).toHaveLength(1)
  })

  it('does not merge into a row screening flagged as spam', async () => {
    const event = await createEvent()
    const address = email()
    const flagged = await register({ event: event.id, email: address, name: 'Ann' })
    await payload.update({
      collection: 'user-submissions',
      id: flagged.id,
      data: { status: 'spam' },
      overrideAccess: true,
    })

    const second = await register({ event: event.id, email: address, name: 'Ann' })
    expect(second.id).not.toBe(flagged.id)

    const rows = await registrationsOf(event.id)
    expect(rows.map((row) => row.status).sort()).toEqual(['pending', 'spam'])
  })

  it('lets a registrant update their registration on a full event', async () => {
    const event = await createEvent({ registrationLimit: 1 })
    const address = email()
    const first = await register({ event: event.id, email: address, name: 'Ann' })

    await expect(register({ event: event.id, email: email(), name: 'Bo' })).rejects.toMatchObject({
      status: 409,
      data: { code: 'event_full' },
    })
    await expect(
      register({ event: event.id, email: address, name: 'Ann Smith' }),
    ).resolves.toMatchObject({ id: first.id })

    expect(await registrationsOf(event.id)).toHaveLength(1)
  })

  it('records what the update replaced, so a manager can put it back', async () => {
    // The merge is keyed on an unverified address, so this entry is the only
    // record the overwritten values leave: the collection keeps no versions.
    const event = await createEvent()
    const address = email()
    const first = await register({
      event: event.id,
      email: address,
      name: 'Ann',
      startingAt: SESSION_A,
    })
    await payload.update({
      collection: 'user-submissions',
      id: first.id,
      data: { status: 'accepted' },
      overrideAccess: true,
    })

    await register({ event: event.id, email: address, name: 'Bo', startingAt: SESSION_B })

    const [row] = (await registrationsOf(event.id)) as UserSubmission[]
    const update = asLog(row!.activityLog).find((entry) => entry.type === 'registration-update')
    expect(update).toBeDefined()
    const replaced = update!.replaced as {
      status: string
      startingAt: string
      submissionData: { field: string; value: string }[]
    }
    expect(replaced.status).toBe('accepted')
    expect(new Date(replaced.startingAt).toISOString()).toBe(SESSION_A)
    expect(replaced.submissionData).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'name', value: 'Ann' })]),
    )
    // Visible beside the entry, so an overwrite is not only machine-readable.
    expect(update!.cells.activity).toMatchObject({ sub: 'Replaced: Ann · Accepted' })
  })

  it('folds into the seat a sender holds, not a newer failed row', async () => {
    const event = await createEvent({ registrationLimit: 1 })
    const address = email()
    const held = await register({ event: event.id, email: address, name: 'Ann' })
    await payload.update({
      collection: 'user-submissions',
      id: held.id,
      data: { status: 'accepted' },
      overrideAccess: true,
    })

    // A manager's write skips the merge, which is how one sender comes to hold
    // two rows for an event — the shape a legacy duplicate leaves behind.
    // `createdAt` is set rather than left to the clock, so the ordering under
    // test is the fixture's and not two creates a millisecond apart.
    const dead = await payload.create({
      collection: 'user-submissions',
      data: createData<'user-submissions'>({
        type: 'registration',
        event: event.id,
        senderEmail: address,
        createdAt: new Date(Date.now() + 1000).toISOString(),
      } as never),
      overrideAccess: true,
    })
    await payload.update({
      collection: 'user-submissions',
      id: dead.id,
      data: { status: 'failed' },
      overrideAccess: true,
    })

    // The event is full on the one active row, and a sender updating the seat
    // they hold takes no new one — so the gate waives `event_full` here too.
    await expect(
      register({ event: event.id, email: address, name: 'Ann Smith' }),
    ).resolves.toMatchObject({ id: held.id })

    const rows = (await registrationsOf(event.id)) as UserSubmission[]
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.id === held.id)!.status).toBe('pending')
    expect(rows.find((row) => row.id === dead.id)!.status).toBe('failed')
  })

  it('leaves a manager’s own write alone', async () => {
    // Recording a registration by hand is deliberate, as for the gate.
    const event = await createEvent()
    const address = email()
    await register({ event: event.id, email: address, name: 'Ann' })

    await payload.create({
      collection: 'user-submissions',
      data: createData<'user-submissions'>({
        type: 'registration',
        event: event.id,
        senderEmail: address,
      } as never),
      overrideAccess: true,
    })

    expect(await registrationsOf(event.id)).toHaveLength(2)
  })
})
