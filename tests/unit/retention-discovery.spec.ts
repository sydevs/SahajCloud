/**
 * How the nightly sweep finds what to sweep (#987). What each collection
 * *deletes* is pinned beside it — `submission-retention.spec.ts` and
 * `job-retention.spec.ts` for the windows, the `retention-*.int.spec.ts` files
 * for the sweep, which also reads the real config's declarations back. This
 * file is about discovery, on a config this spec builds itself.
 */
import type { Field, Payload, SanitizedConfig } from 'payload'

import { describe, expect, it } from 'vitest'

import { payloadJobsRetention } from '@/collections/PayloadJobs/retention'
import { userSubmissionsRetention } from '@/collections/UserSubmissions/retention'
import { CleanupCollections } from '@/jobs/CleanupCollections/CleanupCollections'
import { retentionEntries } from '@/lib/retention'
import { importsRetention } from '@/plugins/eventImport/retention'

import { runTaskHandler } from '../utils/taskRunner'

const fieldNames = (fields: Field[] | undefined) =>
  (fields ?? []).map((field) => ('name' in field ? field.name : undefined))

/** The three real declarations, in the order the app's own config carries them. */
const DECLARED = [
  { custom: { retention: userSubmissionsRetention }, slug: 'user-submissions' },
  { custom: { retention: importsRetention }, slug: 'imports' },
  { custom: { retention: payloadJobsRetention }, slug: 'payload-jobs' },
]

/** A payload stub whose `config.collections` is the list under test. */
const stubPayload = (args: {
  collections?: unknown[]
  count?: (args: { collection: string }) => Promise<{ totalDocs: number }>
  info?: (entry: { collections?: unknown }) => void
}) =>
  ({
    config: { collections: args.collections ?? DECLARED } as unknown as SanitizedConfig,
    count: args.count ?? (async () => ({ totalDocs: 0 })),
    find: async () => ({ docs: [] }),
    logger: { error: () => {}, info: args.info ?? (() => {}), warn: () => {} },
  }) as unknown as Payload

describe('retention discovery', () => {
  it('sweeps every collection from one nightly task', () => {
    expect(CleanupCollections.schedule).toEqual([{ cron: '0 4 * * *', queue: 'nightly' }])
  })

  it('reads the collections that declare windows, in config order', () => {
    expect(retentionEntries(DECLARED).map((entry) => entry.collection)).toEqual([
      'user-submissions',
      'imports',
      'payload-jobs',
    ])
  })

  /**
   * ⚠ `custom` is typed `Record<string, any>`, so this is the only thing
   * standing between a mistyped declaration and a collection that reports zero
   * every night while reading as swept.
   */
  it('ignores a declaration carrying no windows', () => {
    expect(
      retentionEntries([
        {
          custom: { retention: { excluded: 'a policy decision' } },
          slug: 'meditation-transcripts',
        },
        { custom: { retention: { windows: 7 } }, slug: 'songs' },
        { custom: {}, slug: 'images' },
        { slug: 'pages' },
      ]),
    ).toEqual([])
  })

  /**
   * ⚠ An entry with no window sweeps nothing and reports zero, which reads
   * exactly like a collection that had nothing due.
   */
  it('gives every declared collection at least one window', () => {
    for (const entry of retentionEntries(DECLARED)) {
      expect(entry.windows.length, entry.collection).toBeGreaterThan(0)
    }
  })

  /**
   * The three task slugs this one replaced each carried their own `dryRun`, so
   * an operator reviewing a window before it deletes keeps that. `collection`
   * is what replaces the three separately queueable rows the admin Jobs UI
   * used to show.
   */
  it('offers a dry run and a single-collection run', () => {
    expect(fieldNames(CleanupCollections.inputSchema)).toEqual(
      expect.arrayContaining(['dryRun', 'collection']),
    )
  })

  /**
   * ⚠ Which collections carry retention is not known until `buildConfig` has
   * run the plugins, so a `select`'s options could only be a second list. The
   * throw is what answers a typo instead — and it names the config's own
   * declarations, which a fixed option list could not.
   */
  it('refuses a collection that declares no retention, naming the ones that do', async () => {
    await expect(
      runTaskHandler(CleanupCollections, {
        payload: stubPayload({}),
        input: { collection: 'managers' },
      }),
    ).rejects.toThrow(
      '"managers" declares no retention — user-submissions, imports, payload-jobs do',
    )
  })

  /**
   * ⚠ Three tasks could not fail each other; one task can. Nothing but the
   * `payload-jobs` window bounds that table, so a collection that throws must
   * not cost the ones after it their run — while the run still has to end
   * failed, or a nightly breakage reports as a clean sweep.
   */
  it('sweeps past a collection that throws, and still fails the run', async () => {
    const counted: string[] = []
    const payload = stubPayload({
      count: async ({ collection }) => {
        counted.push(collection)
        if (collection === 'user-submissions') throw new Error('the window query broke')
        return { totalDocs: 0 }
      },
    })

    await expect(
      runTaskHandler(CleanupCollections, { payload, input: { dryRun: true } }),
    ).rejects.toThrow(/user-submissions failed/)

    expect(counted).toEqual(['user-submissions', 'imports', 'payload-jobs'])
  })

  /**
   * ⚠ A throw discards `sweepCollection`'s return value, so the windows that
   * ran before it reported nothing and the collection was absent from the
   * run's report — which `tests/utils/retention.ts` reads as zero, the answer
   * a collection with nothing due gets.
   */
  it('reports what a failed collection deleted before it threw', async () => {
    const logged: { collections?: unknown }[] = []
    let windows = 0
    const payload = stubPayload({
      count: async ({ collection }) => {
        if (collection !== 'user-submissions') return { totalDocs: 0 }
        windows += 1
        if (windows === 3) throw new Error('the third window broke')
        return { totalDocs: 4 }
      },
      info: (entry) => logged.push(entry),
    })

    await expect(
      runTaskHandler(CleanupCollections, { payload, input: { dryRun: true } }),
    ).rejects.toThrow(/user-submissions failed/)

    expect(logged.at(-1)?.collections).toContainEqual({
      collection: 'user-submissions',
      deleted: 8,
    })
  })

  /**
   * ⚠ Per-collection counts, not a total: the sweep cannot name its counters
   * in a static `outputSchema` when the config decides the list, and a total
   * alone cannot tell "nothing was due" apart from "that collection never ran".
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
