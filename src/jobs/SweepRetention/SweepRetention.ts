import type { RetentionCount } from './types'
import type { TaskConfig } from 'payload'

import { RETENTION_REGISTRY } from './registry'
import { SweepFailure, sweepCollection } from './sweepCollection'

/**
 * The one nightly retention sweep, over every entry in `registry.ts`.
 *
 * Replaces `purgeSubmissions`, `sweepEventImports` and `cleanupJobs`, which
 * differed only in their declaration: three slugs, three input schemas, three
 * output schemas and three crons around one loop (#987). A collection joins
 * retention as a registry row now, not as a job folder.
 *
 * ⚠ **One task carries one schedule, and the three it replaces were not one.**
 * `cleanupJobs` ran weekly; here every entry runs nightly and its own window
 * does the bounding. See the `payload-jobs` entry for what that costs.
 *
 * Runs on the existing `nightly` queue at 04:00 UTC, after the 02:00 event
 * expiry and 03:00 notification sweeps, so a slow night does not have three
 * jobs contending.
 */
export const SweepRetention: TaskConfig<'sweepRetention'> = {
  slug: 'sweepRetention',
  label: 'Sweep Retention',
  retries: 2,
  inputSchema: [
    {
      // Test seam: specs inject the clock so they can assert a window boundary
      // without waiting ninety days. Absent in production, where `now` is now.
      name: 'now',
      type: 'text',
    },
    {
      // Reports what *would* go, and deletes nothing.
      name: 'dryRun',
      type: 'checkbox',
    },
    {
      // One task over a registry costs the operator the three queueable rows
      // the admin Jobs UI used to show, so a run can name one entry instead.
      name: 'collection',
      type: 'text',
      admin: {
        description: `One registry collection to sweep. Blank sweeps all of them: ${RETENTION_REGISTRY.map((entry) => entry.collection).join(', ')}.`,
      },
    },
  ],
  outputSchema: [
    { name: 'deleted', type: 'number', required: true },
    { name: 'dryRun', type: 'checkbox', required: true },
    {
      // Named counters cannot carry a registry: the shape would change with
      // every row. One row of this array per collection the run touched,
      // `users` included, which no entry of its own sweeps.
      name: 'collections',
      type: 'array',
      required: true,
      fields: [
        { name: 'collection', type: 'text', required: true },
        { name: 'deleted', type: 'number', required: true },
      ],
    },
  ],
  schedule: [
    {
      cron: '0 4 * * *', // daily at 04:00 UTC (after the 02:00/03:00 sweeps)
      queue: 'nightly',
    },
  ],
  handler: async ({ input, req }) => {
    const now = typeof input?.now === 'string' ? new Date(input.now) : new Date()
    const dryRun = input?.dryRun === true
    const only = typeof input?.collection === 'string' ? input.collection.trim() : ''

    const entries = only
      ? RETENTION_REGISTRY.filter((entry) => entry.collection === only)
      : RETENTION_REGISTRY

    // A typo in the input would otherwise sweep nothing and report success.
    if (only && entries.length === 0) {
      throw new Error(`SweepRetention: no registry entry for collection "${only}"`)
    }

    const collections: RetentionCount[] = []
    const failed: string[] = []

    for (const entry of entries) {
      const { collection, windows } = entry
      const hooks = entry.hooks?.({ dryRun, now, req, windows }) ?? {}

      // ⚠ One task means one failure, where three tasks could not fail each
      // other. Nothing else bounds `payload-jobs`, so an entry that throws must
      // not cost the entries after it their run — the throw is re-raised below
      // instead, once every entry has had its turn. The job runner gives the
      // handler a `req` with no transaction of its own, so a failed delete
      // leaves the next entry's reads working.
      try {
        collections.push({
          collection,
          deleted: await sweepCollection({
            beforeDelete: hooks.beforeDelete,
            collection,
            dryRun,
            label: `SweepRetention/${collection}`,
            now,
            req,
            windows,
          }),
        })

        const extra = await hooks.afterDelete?.()
        if (extra) collections.push(extra)
      } catch (error) {
        failed.push(collection)

        // A sweep that threw mid-window still deleted what the windows before
        // it selected, and the entry owes a row either way. `afterDelete`
        // throws past this branch, its entry's row already pushed above.
        if (error instanceof SweepFailure) {
          collections.push({ collection, deleted: error.deleted })
        }

        req.payload.logger.error({
          msg: `SweepRetention: ${collection} failed`,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const deleted = collections.reduce((total, count) => total + count.deleted, 0)

    if (deleted > 0) {
      req.payload.logger.info({
        msg: dryRun
          ? 'SweepRetention: dry run — nothing was deleted'
          : 'SweepRetention: retention sweep complete',
        deleted,
        collections,
      })
    }

    if (failed.length > 0) {
      throw new Error(`SweepRetention: ${failed.join(', ')} failed — see the logged errors`)
    }

    return { output: { collections, deleted, dryRun } }
  },
}
