import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CleanupCollections } from '@/jobs/CleanupCollections/CleanupCollections'
import { retentionConfigOf, retentionEntries } from '@/jobs/CleanupCollections/entries'

import { deletedIn } from '../utils/retention'
import { runTaskHandler } from '../utils/taskRunner'
import { createTestEnvironment } from '../utils/testHelpers'

const NOW = '2026-10-17T05:00:00.000Z'
const LONG_AGO = '2026-10-01T05:00:00.000Z'
const YESTERDAY = '2026-10-16T05:00:00.000Z'

/**
 * `payload-jobs` retention (#987), and the discovery that finds it. It is run
 * through the whole task rather than in isolation, because the collection input
 * is what an operator reaches for and nothing else exercises it.
 */
describe('payload-jobs retention', () => {
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
   * ⚠ **Payload builds `payload-jobs` itself**, so its window reaches the
   * collection through `jobs.jobsCollectionOverrides` and nothing else. Lose
   * that override and the sweep simply stops finding this collection — no
   * error, and the table grows with `deleteJobOnComplete: false` behind it.
   */
  it('declares its window on the built collection', () => {
    const jobs = payload.config.collections.find((entry) => entry.slug === 'payload-jobs')

    expect(retentionConfigOf(jobs ?? {})?.windows).toHaveLength(1)
  })

  /**
   * ⚠ A dry run reports every collection, including the ones with nothing due.
   * A run that reported only what it deleted would make a collection whose
   * declaration never arrived indistinguishable from a quiet night.
   */
  it('reports a count for every declared collection when none is named', async () => {
    const output = await runTaskHandler(CleanupCollections, {
      payload,
      input: { now: NOW, dryRun: true },
    })

    // Read off the booted config, so a fifth declaration is covered with no
    // edit here. `users` is the one row no collection declares — the
    // `user-submissions` hooks report it, right after the entry that runs them.
    const declared = retentionEntries(payload.config.collections).map((entry) => entry.collection)
    const senders = declared.indexOf('user-submissions')

    expect(senders).toBeGreaterThanOrEqual(0)
    expect(output.collections.map((count) => count.collection)).toEqual([
      ...declared.slice(0, senders + 1),
      'users',
      ...declared.slice(senders + 1),
    ])
  })

  /**
   * ⚠ A queue call in code reaches the handler with whatever it was handed, and
   * an unknown collection would otherwise sweep nothing and report success.
   * The message names the config's own declarations, which is the whole reason
   * the input is not a fixed dropdown.
   */
  it('refuses a collection that declares no retention', async () => {
    await expect(
      runTaskHandler(CleanupCollections, { payload, input: { collection: 'managers' } }),
    ).rejects.toThrow(/"managers" declares no retention — \w[\w-]*, /)
  })
})
