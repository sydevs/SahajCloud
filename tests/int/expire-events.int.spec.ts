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
  // `resolveRecipients` reports a missing region manager this way, so any stage
  // that escalates to the region (`escalated` onward) reaches it. Without the
  // export the whole per-event step throws and the stage never advances.
  captureMessage: vi.fn(),
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

  // ──────────────────────────────────────────────────────────────────────────
  // Publish side effects (#603): finishing must NOT unpublish, because a
  // finished event's Atlas page has to keep resolving for late arrivals. The
  // unverified ladder is unchanged and still unpublishes at `expired`.
  // ──────────────────────────────────────────────────────────────────────────
  describe('publish side effects', () => {
    /**
     * Put a due event into a given stage. Stage / nextCheckAt / _status are set
     * in one `skipVerifyHook` update so the verifyOnSave hook doesn't reset the
     * stage to `verified` and stamp a future nextCheckAt.
     */
    async function createDueEventAtStage(
      payload: Payload,
      title: string,
      stage: 'verified' | 'urgent' | 'expired',
      overrides: Record<string, unknown> = {},
    ) {
      const event = await testData.createEvent(payload, { title, ...overrides } as never)
      return payload.update({
        collection: 'events',
        id: event.id,
        data: { verificationStage: stage, nextCheckAt: DUE, _status: 'published' },
        context: { skipVerifyHook: true },
      })
    }

    const reload = (payload: Payload, id: number) =>
      payload.findByID({ collection: 'events', id, overrideAccess: true, depth: 0 })

    it('marks a run-out event finished and clears nextCheckAt without unpublishing it', async () => {
      const event = await createDueEventAtStage(payload, 'Ran Out', 'verified', {
        inactive: false,
        eventType: 'online',
        onlineUrl: 'https://example.com/ran-out',
        // A one-off long past — finished.
        schedule: { firstDate: '2021-02-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
      })
      expect(event._status).toBe('published')

      const result = await runTask(payload)
      expect(result.finished).toBeGreaterThanOrEqual(1)

      const after = await reload(payload, event.id)
      expect(after.verificationStage).toBe('finished')
      expect(after.nextCheckAt).toBeNull()
      // The whole point: still published, so webPath/webUrl stay resolvable.
      expect(after._status).toBe('published')
      expect(after.webPath).toBeTruthy()
      expect(after.webUrl).toBeTruthy()
    })

    it('does not finish an event whose recurrence never ends', async () => {
      const event = await createDueEventAtStage(payload, 'Still Running', 'verified', {
        inactive: false,
        eventType: 'online',
        onlineUrl: 'https://example.com/running',
        schedule: {
          firstDate: '2021-02-01T10:00:00.000Z',
          firstDate_tz: 'Europe/London',
          recurrenceType: 'DAILY',
          interval: 1,
        },
      })

      await runTask(payload)

      const after = await reload(payload, event.id)
      expect(after.verificationStage).not.toBe('finished')
      expect(after._status).toBe('published')
    })

    it('still unpublishes an unverified event at the urgent → expired step', async () => {
      // inactive, so the finished-check can never claim it — it must take the ladder.
      const event = await createDueEventAtStage(payload, 'Gone Unverified', 'urgent')

      await runTask(payload)

      const after = await reload(payload, event.id)
      expect(after.verificationStage).toBe('expired')
      expect(after._status).toBe('draft')
    })

    it('still trashes an expired event after the grace period', async () => {
      const event = await createDueEventAtStage(payload, 'Long Expired', 'expired')

      const result = await runTask(payload)
      expect(result.trashed).toBeGreaterThanOrEqual(1)

      const after = await payload.findByID({
        collection: 'events',
        id: event.id,
        overrideAccess: true,
        depth: 0,
        trash: true,
      })
      expect(after.deletedAt).toBeTruthy()
    })
  })
})
