/**
 * The registry's own invariants (#987). What each entry *deletes* is pinned
 * beside it — `submission-retention.spec.ts` and `job-retention.spec.ts` for the
 * windows, the `retention-*.int.spec.ts` files for the sweep. This file is about
 * the shape the registry has to keep for those to mean anything.
 */
import type { Field, Payload } from 'payload'

import { describe, expect, it } from 'vitest'

import { CleanupCollections } from '@/jobs/CleanupCollections/CleanupCollections'
import { NO_RETENTION, RETENTION_REGISTRY } from '@/jobs/CleanupCollections/registry'

import { runTaskHandler } from '../utils/taskRunner'

const fieldNames = (fields: Field[] | undefined) =>
  (fields ?? []).map((field) => ('name' in field ? field.name : undefined))

describe('the retention registry', () => {
  it('sweeps every collection from one nightly task', () => {
    expect(CleanupCollections.schedule).toEqual([{ cron: '0 4 * * *', queue: 'nightly' }])
  })

  /**
   * ⚠ An entry with no window sweeps nothing and reports zero, which reads
   * exactly like a collection that had nothing due.
   */
  it('gives every entry at least one window', () => {
    for (const entry of RETENTION_REGISTRY) {
      expect(entry.windows.length).toBeGreaterThan(0)
    }
  })

  it('names each collection once', () => {
    const slugs = RETENTION_REGISTRY.map((entry) => entry.collection)

    expect([...new Set(slugs)]).toEqual(slugs)
  })

  /**
   * Both lists are read by a person deciding whether a collection's retention is
   * settled, so a collection in both would answer that question twice.
   */
  it('excuses no collection it also sweeps', () => {
    for (const entry of RETENTION_REGISTRY) {
      expect(Object.keys(NO_RETENTION)).not.toContain(entry.collection)
    }
  })

  /**
   * ⚠ The reason is the whole value of `NO_RETENTION`. A bare slug would read as
   * a decision taken while recording none, which is what an absent collection
   * already means. The key is checked by its type, not here.
   */
  it('gives every excused collection a reason', () => {
    for (const [collection, reason] of Object.entries(NO_RETENTION)) {
      expect(reason?.trim(), collection).toBeTruthy()
    }
  })

  /**
   * The three task slugs this one replaced each carried their own `dryRun`, so
   * an operator reviewing a window before it deletes keeps that. `collection`
   * is what replaces the three separately queueable rows the admin Jobs UI used
   * to show.
   */
  it('offers a dry run and a single-collection run', () => {
    expect(fieldNames(CleanupCollections.inputSchema)).toEqual(
      expect.arrayContaining(['dryRun', 'collection']),
    )
  })

  /**
   * ⚠ The dropdown's options are the registry itself, so a row added to one
   * reaches the other. Free text left the typo case to a runtime throw, and
   * left the operator retyping a slug the task already knows.
   */
  it('offers the registry as the collection options', () => {
    const field = (CleanupCollections.inputSchema ?? []).find(
      (entry) => 'name' in entry && entry.name === 'collection',
    )

    expect(field?.type).toBe('select')
    expect(field && 'options' in field ? field.options : []).toEqual(
      RETENTION_REGISTRY.map((entry) => entry.collection),
    )
  })

  /**
   * ⚠ Three tasks could not fail each other; one task can. Nothing but the
   * `payload-jobs` entry bounds that table, so an entry that throws must not
   * cost the entries after it their run — while the run still has to end
   * failed, or a nightly breakage reports as a clean sweep.
   */
  it('sweeps past an entry that throws, and still fails the run', async () => {
    const counted: string[] = []
    const payload = {
      count: async ({ collection }: { collection: string }) => {
        counted.push(collection)
        if (collection === 'user-submissions') throw new Error('the window query broke')
        return { totalDocs: 0 }
      },
      find: async () => ({ docs: [] }),
      logger: { error: () => {}, info: () => {}, warn: () => {} },
    } as unknown as Payload

    await expect(
      runTaskHandler(CleanupCollections, { payload, input: { dryRun: true } }),
    ).rejects.toThrow(/user-submissions failed/)

    expect(counted).toEqual(['user-submissions', 'imports', 'payload-jobs'])
  })

  /**
   * ⚠ A throw discards `sweepCollection`'s return value, so the windows that
   * ran before it reported nothing and the entry was absent from the run's
   * report — which `tests/utils/retention.ts` reads as zero, the answer a
   * collection with nothing due gets.
   */
  it('reports what a failed entry deleted before it threw', async () => {
    const logged: { collections?: unknown }[] = []
    let windows = 0
    const payload = {
      count: async ({ collection }: { collection: string }) => {
        if (collection !== 'user-submissions') return { totalDocs: 0 }
        windows += 1
        if (windows === 3) throw new Error('the third window broke')
        return { totalDocs: 4 }
      },
      find: async () => ({ docs: [] }),
      logger: {
        error: () => {},
        info: (entry: { collections?: unknown }) => logged.push(entry),
        warn: () => {},
      },
    } as unknown as Payload

    await expect(
      runTaskHandler(CleanupCollections, { payload, input: { dryRun: true } }),
    ).rejects.toThrow(/user-submissions failed/)

    expect(logged.at(-1)?.collections).toContainEqual({
      collection: 'user-submissions',
      deleted: 8,
    })
  })

  /**
   * ⚠ Per-collection counts, not a total: a registry cannot name its counters
   * in a static `outputSchema`, and a total alone cannot tell "nothing was due"
   * apart from "that entry never ran".
   */
  it('reports a count per collection', () => {
    const collections = (CleanupCollections.outputSchema ?? []).find(
      (field) => 'name' in field && field.name === 'collections',
    )

    expect(collections?.type).toBe('array')
    expect(fieldNames(collections && 'fields' in collections ? collections.fields : [])).toEqual([
      'collection',
      'deleted',
    ])
  })
})
