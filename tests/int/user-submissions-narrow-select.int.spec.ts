/**
 * A create's `select` is a caller-set query parameter that nothing polices —
 * `validateClientQueryParamsHook` returns on anything that is not a read
 * (`docs/rules/api-clients.md`, "writes are unaffected"). It narrows the
 * `afterRead` projection payload hands the `afterChange` hooks, so a hook
 * gating on `doc.<field>` can be switched off from the request.
 *
 * `mergeRepeatRegistration` is covered in its own file (#1093). These are its
 * three siblings on the same collection, which the same request reaches.
 *
 * A sibling file for the reason the gate spec gives: one
 * `createTestEnvironment()` per file (`tests/AGENTS.md`).
 */
import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Event, Manager, UserSubmission } from '@/payload-types'

import { createRestClientWithAuth, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

/** Seeded plaintext: Payload returns `apiKey: null` from a create, encrypted. */
const REST_API_KEY = 'atlas-widget-key-for-narrow-select-spec'

const FUTURE_WEEKLY = {
  firstDate: '2027-03-03T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
} as const

/** The projection that empties `doc` of everything but the new row's id. */
const NARROW = '/api/user-submissions?select[id]=true'

describe('a client create whose `select` hides the fields a hook keys on', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let manager: Manager
  let asClient: RestClient

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

  const registerNarrowly = async (args: {
    event: number
    email: string
    subscribe?: boolean
  }): Promise<number> => {
    const response = await asClient(NARROW, {
      method: 'POST',
      json: {
        type: 'registration',
        event: args.event,
        senderEmail: args.email,
        submissionData: [
          { field: 'name', value: 'Ann' },
          ...(args.subscribe ? [{ field: 'subscribe', value: 'yes' }] : []),
        ],
      },
    })
    expect(response.status).toBe(201)
    return (response.body as { doc: { id: number } }).doc.id
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    verifyMock.mockResolvedValue({ success: true })

    manager = await testData.createManager(payload, {
      name: 'Narrow Select Admin',
      email: 'narrow-select-admin@example.com',
    })
    await testData.createClient(payload, manager.id, {
      label: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
      apiKey: REST_API_KEY,
    })
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

  it('still queues screening', async () => {
    // The severe one. Unscreened means no disposable-address check, no content
    // scan, no `spam` verdict and no abuse strike — so the row is delivered as
    // though a human had cleared it.
    const event = await createEvent()
    const id = await registerNarrowly({ event: event.id, email: 'screen.me@example.com' })

    const { docs } = await payload.find({
      collection: 'payload-jobs',
      where: { taskSlug: { equals: 'screenSubmission' } },
      pagination: false,
      overrideAccess: true,
    })
    const screened = docs.map((job) => (job.input as { submissionId?: number }).submissionId)
    expect(screened).toContain(id)
  })

  it('still recomputes the event’s fullness flag', async () => {
    const event = await createEvent({ registrationLimit: 1 })
    await registerNarrowly({ event: event.id, email: 'fills.it@example.com' })

    const after = (await payload.findByID({
      collection: 'events',
      id: event.id,
      depth: 0,
      overrideAccess: true,
    })) as Event
    expect(after.registrationsFull).toBe(true)
  })

  it('still spawns the opt-in subscribe row', async () => {
    // The consent record. Without it the registrant ticked the box and nothing
    // anywhere says so — the silence `mailingListSubscribedAt` was replaced to
    // stop.
    const event = await createEvent()
    await registerNarrowly({
      event: event.id,
      email: 'opts.in@example.com',
      subscribe: true,
    })

    const { docs } = await payload.find({
      collection: 'user-submissions',
      where: { and: [{ type: { equals: 'subscribe' } }, { event: { equals: event.id } }] },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    expect(docs).toHaveLength(1)
    expect((docs[0] as UserSubmission).senderEmail).toBe('opts.in@example.com')
  })
})
