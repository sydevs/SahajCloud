/**
 * Integration tests for the `purgeUserMessages` retention sweep (#632).
 *
 * Rather than backdating rows, these seed at "now" and run the task with an
 * injected future clock — the `now` input exists for exactly this. The anchor is
 * computed **after** the rows are created, or a row written a millisecond later
 * would fall outside the window the assertion assumes (the trap that makes
 * window-job specs flaky).
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { MessageStatus } from '@/collections/UserMessages/statuses'
import {
  DELIVERED_RETENTION_DAYS,
  PurgeUserMessages,
  SPAM_RETENTION_DAYS,
} from '@/jobs/PurgeUserMessages/PurgeUserMessages'
import type { UserMessage } from '@/payload-types'

import { runTaskHandler } from '../utils/taskRunner'
import { createTestEnvironment } from '../utils/testHelpers'

const DAY_MS = 24 * 60 * 60 * 1000

describe('User message retention', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let seedCounter = 0

  /** A message pinned at a terminal status, as the screening job would leave it. */
  const seed = (status: MessageStatus) =>
    payload.create({
      collection: 'user-messages',
      data: {
        message: `Retention fixture body number ${(seedCounter += 1)}.`,
        status,
      } as never,
      overrideAccess: true,
      req: { payload, context: { skipWriteGuard: true } } as unknown as PayloadRequest,
    }) as Promise<UserMessage>

  /** Run the sweep as if `days` had passed since the rows were written. */
  const purgeAfter = (days: number, anchor: number) =>
    runTaskHandler(PurgeUserMessages, {
      payload,
      input: { now: new Date(anchor + days * DAY_MS).toISOString() },
    })

  const survives = async (id: number) => {
    const found = await payload.findByID({
      collection: 'user-messages',
      id,
      overrideAccess: true,
      disableErrors: true,
    })
    return found != null
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  it('deletes delivered messages once their window has passed, and not before', async () => {
    const message = await seed('delivered')
    // Anchor AFTER the create, so `createdAt` is guaranteed to precede it.
    const anchor = Date.now()

    await purgeAfter(DELIVERED_RETENTION_DAYS - 1, anchor)
    expect(await survives(message.id), 'purged a day early').toBe(true)

    const result = await purgeAfter(DELIVERED_RETENTION_DAYS + 1, anchor)
    expect(await survives(message.id)).toBe(false)
    expect(result.deletedDelivered).toBe(1)
  })

  it('keeps spam far longer — it is evidence, not clutter', async () => {
    const message = await seed('spam')
    const anchor = Date.now()

    // Well past the delivered window, nowhere near the spam one.
    const early = await purgeAfter(DELIVERED_RETENTION_DAYS + 1, anchor)
    expect(await survives(message.id)).toBe(true)
    expect(early.deletedSpam).toBe(0)

    const late = await purgeAfter(SPAM_RETENTION_DAYS + 1, anchor)
    expect(await survives(message.id)).toBe(false)
    expect(late.deletedSpam).toBe(1)
  })

  it('never sweeps a failed message, however old', async () => {
    // The one state where deleting the row destroys the only record that a
    // message was accepted and never delivered. It waits for a human.
    const message = await seed('failed')
    const anchor = Date.now()

    await purgeAfter(SPAM_RETENTION_DAYS * 10, anchor)
    expect(await survives(message.id)).toBe(true)
  })

  it('never sweeps a message still being screened', async () => {
    // A stuck row is a bug to notice, not garbage to collect.
    const message = await seed('screening')
    const anchor = Date.now()

    await purgeAfter(SPAM_RETENTION_DAYS * 10, anchor)
    expect(await survives(message.id)).toBe(true)
  })

  it('reports nothing deleted when nothing is due', async () => {
    await seed('delivered')
    const anchor = Date.now()

    const result = await purgeAfter(0, anchor)
    expect(result).toMatchObject({ deletedDelivered: 0, deletedSpam: 0 })
  })
})
