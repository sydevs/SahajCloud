import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CleanupJobs } from '@/jobs/CleanupJobs/CleanupJobs'

import { runTaskHandler } from '../utils/taskRunner'
import { createTestEnvironment } from '../utils/testHelpers'

const NOW = '2026-10-17T05:00:00.000Z'
const LONG_AGO = '2026-10-01T05:00:00.000Z'
const YESTERDAY = '2026-10-16T05:00:00.000Z'

describe('CleanupJobs', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  const seedJob = async (data: { completedAt?: string; hasError?: boolean }) =>
    payload.create({
      collection: 'payload-jobs',
      data: { taskSlug: 'cleanupJobs', queue: 'nightly', input: {}, ...data },
      overrideAccess: true,
    })

  const idsRemaining = async () => {
    const { docs } = await payload.find({
      collection: 'payload-jobs',
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    return docs.map((doc) => doc.id)
  }

  it('sweeps a finished row past the window and keeps everything else', async () => {
    const old = await seedJob({ completedAt: LONG_AGO })
    const recent = await seedJob({ completedAt: YESTERDAY })
    // Queued rather than finished: it is old because nothing has run it yet,
    // and sweeping it would cancel work nobody asked to cancel.
    const queued = await seedJob({})

    const { deletedJobs } = await runTaskHandler(CleanupJobs, { payload, input: { now: NOW } })

    expect(deletedJobs).toBe(1)
    const remaining = await idsRemaining()
    expect(remaining).toContain(recent.id)
    expect(remaining).toContain(queued.id)
    expect(remaining).not.toContain(old.id)
  })

  it('sweeps a row that errored out, which carries no completedAt', async () => {
    const errored = await seedJob({ hasError: true })
    await payload.db.updateOne({
      collection: 'payload-jobs',
      id: errored.id,
      data: { updatedAt: LONG_AGO },
      req: undefined,
    })

    const { deletedJobs } = await runTaskHandler(CleanupJobs, { payload, input: { now: NOW } })

    expect(deletedJobs).toBe(1)
    expect(await idsRemaining()).not.toContain(errored.id)
  })

  it('counts without deleting on a dry run', async () => {
    const old = await seedJob({ completedAt: LONG_AGO })

    const { deletedJobs } = await runTaskHandler(CleanupJobs, {
      payload,
      input: { now: NOW, dryRun: true },
    })

    expect(deletedJobs).toBe(1)
    expect(await idsRemaining()).toContain(old.id)
  })
})
