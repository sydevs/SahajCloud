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
import { relationId } from '@/lib/utilities/relationId'
import type { Client, Event, Manager, UserSubmission } from '@/payload-types'

import { createRestClientWithAuth, type RestClient } from '../utils/restRequest'
import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { captureMessageMock, verifyMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
  verifyMock: vi.fn(),
}))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

// `captureException` is owed as well as the message asserted below: the
// `event_full` refusal reaches it through the Local API capture wrapper.
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: captureMessageMock,
}))

const FUTURE_WEEKLY = {
  firstDate: '2027-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
} as const

/** Seeded plaintext: Payload returns `apiKey: null` from a create, encrypted. */
const REST_API_KEY = 'atlas-widget-key-for-repeat-registration-spec'

const SESSION_A = '2027-01-06T10:00:00.000Z'
const SESSION_B = '2027-01-13T10:00:00.000Z'

describe('a repeat registration updates the existing one', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let client: Client
  let asClient: RestClient

  const clientReq = (as: Client = client): PayloadRequest =>
    ({
      payload,
      headers: new Headers({ 'x-turnstile-token': 'tok-valid' }),
      user: { ...as, collection: 'clients' },
      context: {},
    }) as unknown as PayloadRequest

  const register = (args: {
    as?: Client
    email: string
    event: number
    name: string
    startingAt?: string
  }) =>
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
      req: clientReq(args.as),
    }) as Promise<UserSubmission>

  const setStatus = (id: number, status: UserSubmission['status']) =>
    payload.update({
      collection: 'user-submissions',
      id,
      data: { status },
      overrideAccess: true,
    })

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
      apiKey: REST_API_KEY,
    })
    // The REST surface, because `select` is a query parameter and the local API
    // cannot carry one. The create's response projection is what the merge hook
    // reads its own inputs from.
    asClient = createRestClientWithAuth(
      { config: env.config, payload },
      {
        Authorization: `clients API-Key ${REST_API_KEY}`,
        'x-turnstile-token': 'tok-valid',
      },
    )
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
    await setStatus(first.id, 'accepted')

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
    // The row's own `createdAt` is not echoed: it answered "is this address
    // registered for this event?" to anyone holding a key. The stored row still
    // keeps it, asserted below.
    expect(second.createdAt).not.toBe(first.createdAt)

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
    await setStatus(flagged.id, 'spam')

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
    await setStatus(first.id, 'accepted')

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
    // Visible beside the entry, so an overwrite is not only machine-readable —
    // and built from the status alone, never from text the sender wrote.
    expect(update!.cells.activity).toMatchObject({ sub: 'Previously Accepted' })
  })

  it('folds into the seat a sender holds, not a newer failed row', async () => {
    const event = await createEvent({ registrationLimit: 1 })
    const address = email()
    const held = await register({ event: event.id, email: address, name: 'Ann' })
    await setStatus(held.id, 'accepted')

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
    await setStatus(dead.id, 'failed')

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

  it('merges a REST create whose `select` hides the fields the hook keys on', async () => {
    // ⚠ A create's `select` is a query parameter the caller sets, and nothing
    // polices it: the client query gate only guards reads. It narrows the
    // `afterRead` projection the `afterChange` hooks are handed, so a hook
    // reading its inputs off `doc` can be switched off from the request — while
    // `gateRegistration`, which reads `data`, has already waived `event_full`.
    const event = await createEvent({ registrationLimit: 1 })
    const address = email()
    const first = await register({ event: event.id, email: address, name: 'Ann' })

    const response = await asClient('/api/user-submissions?select[id]=true', {
      method: 'POST',
      json: {
        type: 'registration',
        event: event.id,
        senderEmail: address,
        submissionData: [{ field: 'name', value: 'Ann Smith' }],
      },
    })

    expect(response.status).toBe(201)
    const rows = (await registrationsOf(event.id)) as UserSubmission[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(first.id)
    expect(rows[0]!.submissionData as unknown as { field: string; value: string }[]).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: 'Ann Smith' })]),
    )
  })

  it('leaves the row attributed to the key it arrived on', async () => {
    // `client` brands the registrant's confirmation mail, and `systemFieldAccess`
    // closes it to every client write — so a merge must not carry the caller's
    // own key onto a row another organisation's key created.
    const event = await createEvent()
    const address = email()
    const other = await testData.createClient(payload, manager.id, {
      name: 'Another Org',
      roles: ['sahaj-atlas-client'],
    })

    const first = await register({ event: event.id, email: address, name: 'Ann' })
    expect(relationId(first.client)).toBe(client.id)

    const second = await register({
      as: other,
      email: address,
      event: event.id,
      name: 'Ann Smith',
    })

    expect(second.id).toBe(first.id)
    const [row] = (await registrationsOf(event.id)) as UserSubmission[]
    expect(relationId(row!.client)).toBe(client.id)
    const update = asLog(row!.activityLog).find((e) => e.type === 'registration-update')
    expect(update!.submittedVia).toBe(other.id)
  })

  it('reports an overwritten confirmation outside the caller’s reach', async () => {
    // The entry above is capped and this collection keeps no versions, so
    // enough repeat signups roll the original values out of the only record a
    // manager can read. This report is the one that is not reachable that way.
    const event = await createEvent()
    const address = email()
    const first = await register({ event: event.id, email: address, name: 'Ann' })
    await setStatus(first.id, 'accepted')
    captureMessageMock.mockClear()

    await register({ event: event.id, email: address, name: 'Bo' })

    expect(captureMessageMock).toHaveBeenCalledTimes(1)
    const [, options] = captureMessageMock.mock.calls[0] as [
      string,
      {
        extra: Record<string, unknown>
        fingerprint: string[]
        level: string
        tags: Record<string, string>
      },
    ]
    expect(options.level).toBe('warning')
    // Keyed by the row, so repeats against one registration group rather than
    // arriving as unrelated reports — the recurrence is the signal.
    expect(options.fingerprint).toEqual(['mergeRepeatRegistration', String(first.id)])
    expect(options.extra).toMatchObject({
      eventId: event.id,
      submissionId: first.id,
      submittedVia: client.id,
    })
    // The shared capture body, reached through the hook rather than called
    // directly — `environment` is the tag only that body attaches.
    expect(options.tags).toMatchObject({ environment: expect.any(String) })
  })

  it('does not report a repeat signup into a registration nobody confirmed', async () => {
    const event = await createEvent()
    const address = email()
    await register({ event: event.id, email: address, name: 'Ann' })
    captureMessageMock.mockClear()

    await register({ event: event.id, email: address, name: 'Ann Smith' })

    expect(captureMessageMock).not.toHaveBeenCalled()
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
