import type { Payload, TaskInput } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CleanupCollections } from '@/jobs/CleanupCollections/CleanupCollections'
import { RETENTION_REGISTRY } from '@/jobs/CleanupCollections/registry'

import { deletedIn } from '../utils/retention'
import { runTaskHandler } from '../utils/taskRunner'
import { createTestEnvironment } from '../utils/testHelpers'

/** The generated input's own spelling of the registry, so this spec cannot drift from it. */
type RetentionCollection = NonNullable<TaskInput<'cleanupCollections'>['collection']>

const NOW = '2026-10-17T05:00:00.000Z'
const LONG_AGO = '2026-10-01T05:00:00.000Z'
const YESTERDAY = '2026-10-16T05:00:00.000Z'

/**
 * The `payload-jobs` registry entry (#987). It is run through the whole task
 * rather than in isolation, because the collection input is what an operator
 * reaches for and nothing else exercises it.
 */
describe('the payload-jobs retention entry', () => {
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
      data: { taskSlug: 'cleanupCollections', queue: 'nightly', input: {}, ...data },
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

    const output = await runTaskHandler(CleanupCollections, {
      payload,
      input: { now: NOW, collection: 'payload-jobs' },
    })

    expect(deletedIn(output, 'payload-jobs')).toBe(1)
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

    const output = await runTaskHandler(CleanupCollections, {
      payload,
      input: { now: NOW, collection: 'payload-jobs' },
    })

    expect(deletedIn(output, 'payload-jobs')).toBe(1)
    expect(await idsRemaining()).not.toContain(errored.id)
  })

  it('counts without deleting on a dry run', async () => {
    const old = await seedJob({ completedAt: LONG_AGO })

    const output = await runTaskHandler(CleanupCollections, {
      payload,
      input: { now: NOW, dryRun: true, collection: 'payload-jobs' },
    })

    expect(deletedIn(output, 'payload-jobs')).toBe(1)
    expect(output.dryRun).toBe(true)
    expect(await idsRemaining()).toContain(old.id)
  })

  /**
   * ⚠ A dry run reports every entry, including the ones with nothing due. A
   * run that reported only what it deleted would make a misspelled registry
   * entry indistinguishable from a quiet night.
   */
  it('reports a count for every entry when no collection is named', async () => {
    const output = await runTaskHandler(CleanupCollections, {
      payload,
      input: { now: NOW, dryRun: true },
    })

    // Derived, so a fourth entry is covered with no edit here. `users` is the
    // one row no entry of its own sweeps — the submissions hooks report it.
    expect(output.collections.map((count) => count.collection)).toEqual([
      'user-submissions',
      'users',
      ...RETENTION_REGISTRY.slice(1).map((entry) => entry.collection),
    ])
  })

  /**
   * The admin dropdown offers the registry and nothing else, and the generated
   * input type says so — which is why this case has to spell the value past it.
   * ⚠ A queue call in code reaches the handler with whatever it was handed, and
   * an unknown collection would otherwise sweep nothing and report success.
   */
  it('refuses a collection the registry does not name', async () => {
    const collection = 'managers' as RetentionCollection

    await expect(
      runTaskHandler(CleanupCollections, { payload, input: { collection } }),
    ).rejects.toThrow(/no registry entry/)
  })
})
