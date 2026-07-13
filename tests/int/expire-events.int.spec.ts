import type { Payload } from 'payload'

import * as Sentry from '@sentry/nextjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpireEvents } from '@/jobs/ExpireEvents/ExpireEvents'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

// Hoisted so the vi.mock factory (hoisted above imports) can close over it, while
// the tests can still assert what context the handler attached to the Sentry scope.
const { setContextMock } = vi.hoisted(() => ({ setContextMock: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn((callback: (scope: { setContext: typeof setContextMock }) => void) =>
    callback({ setContext: setContextMock }),
  ),
  captureException: vi.fn(),
}))

type ExpireResult = {
  processed: number
  finished: number
  advanced: number
  trashed: number
  remindersSent: number
  failed: number
}

async function runTask(payload: Payload): Promise<ExpireResult> {
  const req = {
    payload,
    context: {},
    headers: new Headers(),
  } as Parameters<typeof ExpireEvents.handler>[0]['req']

  const result = await ExpireEvents.handler({
    req,
    input: {},
    job: {} as Parameters<typeof ExpireEvents.handler>[0]['job'],
    tasks: {} as Parameters<typeof ExpireEvents.handler>[0]['tasks'],
    inlineTask: (() => {}) as Parameters<typeof ExpireEvents.handler>[0]['inlineTask'],
  })
  return result.output as ExpireResult
}

/** Make `payload.findByID` throw for one event id (mimics a broken record), pass through otherwise. */
function failEventLoad(payload: Payload, failingId: number) {
  const original = payload.findByID.bind(payload)
  return vi.spyOn(payload, 'findByID').mockImplementation(((
    args: Parameters<typeof payload.findByID>[0],
  ) => {
    if (args.collection === 'events' && args.id === failingId) {
      throw new Error('simulated per-event processing failure')
    }
    return original(args)
  }) as typeof payload.findByID)
}

const DUE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 24h ago

async function createDueEvent(payload: Payload, title: string) {
  const event = await testData.createEvent(payload, { title, verificationStage: 'verified' })
  // The handler only picks up events whose nextCheckAt has passed. `skipVerifyHook`
  // is the same context flag the real job uses so the verifyOnSave beforeChange
  // hook doesn't clobber our backdated value with `now + cadence`.
  await payload.update({
    collection: 'events',
    id: event.id,
    data: { nextCheckAt: DUE },
    context: { skipVerifyHook: true },
  })
  return event
}

describe('ExpireEvents job', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('declares the single-run concurrency lock and processes each due event once', async () => {
    // The lock itself is enforced by Payload's queue at runtime; what's under our
    // control (and what this asserts) is that the task declares it correctly.
    const concurrency = ExpireEvents.concurrency as
      | { key: (args: { input: unknown; queue: string }) => string; exclusive?: boolean }
      | undefined
    expect(concurrency).toBeDefined()
    expect(concurrency!.exclusive).toBe(true)
    expect(concurrency!.key({ input: {}, queue: 'nightly' })).toBe('expireEvents')

    await createDueEvent(payload, 'Event 1')
    await createDueEvent(payload, 'Event 2')

    const result = await runTask(payload)

    // Both due events attempted exactly once, none failed.
    expect(result.processed).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('captures a per-event processing failure to Sentry with the event id', async () => {
    const failing = await createDueEvent(payload, 'Failing')
    await createDueEvent(payload, 'Healthy')

    const spy = failEventLoad(payload, failing.id)
    try {
      const result = await runTask(payload)

      // The failure is caught, counted, and reported to Sentry tagged with the event id.
      expect(result.failed).toBe(1)
      expect(Sentry.captureException).toHaveBeenCalledTimes(1)
      expect(setContextMock).toHaveBeenCalledWith('expireEvents', { eventId: failing.id })
    } finally {
      spy.mockRestore()
    }
  })

  it('continues the sweep after a per-event failure', async () => {
    const failing = await createDueEvent(payload, 'Failing')
    await createDueEvent(payload, 'Healthy')

    const spy = failEventLoad(payload, failing.id)
    try {
      const result = await runTask(payload)

      // At least our two events were attempted and exactly one failed (the one we
      // forced) — so the sweep did not abort on the first failure; it kept going
      // and processed the healthy event. (>= 2 because a failed event from an
      // earlier test stays due — the failure means it never advanced.)
      expect(result.processed).toBeGreaterThanOrEqual(2)
      expect(result.failed).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })
})
