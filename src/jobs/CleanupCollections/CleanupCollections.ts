import type { TaskConfig } from 'payload'

import type { RetentionCount } from '@/types/retention'

import { retentionEntries } from './entries'
import { dueWindows, SweepFailure, sweepCollection } from './sweepCollection'

/**
 * The one nightly retention sweep, over every collection that declares
 * retention on its own `custom.retention` (#987).
 *
 * Replaces `purgeSubmissions`, `sweepEventImports` and `cleanupJobs`, which
 * differed only in their declaration: three slugs, three input schemas, three
 * output schemas and three crons around one loop. A collection joins retention
 * by declaring windows beside the fields they age, not by gaining a job folder.
 *
 * ⚠ **One task carries one schedule, and the three it replaces were not one.**
 * `cleanupJobs` ran weekly; here every collection runs nightly and its own
 * window does the bounding. See `@/collections/PayloadJobs/retention` for what
 * that costs.
 *
 * Runs on the existing `nightly` queue at 04:00 UTC, after the 02:00 event
 * expiry and 03:00 notification sweeps, so a slow night does not have three
 * jobs contending.
 */
export const CleanupCollections: TaskConfig<'cleanupCollections'> = {
  slug: 'cleanupCollections',
  label: 'Cleanup Collections',
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
      // One task over the whole config costs the operator the three queueable
      // rows the admin Jobs UI used to show, so a run can name one collection
      // instead.
      //
      // ⚠ **Not a `select`, because its options could only be a copy.** A
      // field's options are fixed when this task is declared, and which
      // collections carry retention is not known until `buildConfig` has run
      // the plugins — so a dropdown here would be a second list to keep in
      // step. The guard below answers a typo instead, naming what the config
      // does declare.
      name: 'collection',
      type: 'text',
      admin: {
        description: 'One collection to sweep, by slug. Blank sweeps all of them.',
      },
    },
  ],
  outputSchema: [
    { name: 'deleted', type: 'number', required: true },
    { name: 'dryRun', type: 'checkbox', required: true },
    {
      // Named counters cannot carry a list the config decides: the shape would
      // change with every collection. One row of this array per collection the
      // run touched, `users` included, which declares no retention of its own.
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

    const declared = retentionEntries(req.payload.config.collections)
    const entries = only ? declared.filter((entry) => entry.collection === only) : declared

    // A typo in the input would otherwise sweep nothing and report success.
    if (only && entries.length === 0) {
      throw new Error(
        `CleanupCollections: "${only}" declares no retention — ${declared
          .map((entry) => entry.collection)
          .join(', ')} do`,
      )
    }

    const collections: RetentionCount[] = []
    const failed: string[] = []

    for (const entry of entries) {
      const { collection } = entry
      const windows = dueWindows(entry.windows, now)
      const hooks = entry.hooks?.({ dryRun, req, wheres: windows.map((due) => due.where) }) ?? {}

      // ⚠ One task means one failure, where three tasks could not fail each
      // other. Nothing else bounds `payload-jobs`, so a collection that throws
      // must not cost the ones after it their run — the throw is re-raised
      // below instead, once every collection has had its turn. The job runner
      // gives the handler a `req` with no transaction of its own, so a failed
      // delete leaves the next collection's reads working.
      try {
        collections.push({
          collection,
          deleted: await sweepCollection({
            beforeDelete: hooks.beforeDelete,
            collection,
            dryRun,
            label: `CleanupCollections/${collection}`,
            req,
            windows,
          }),
        })

        const extra = await hooks.afterDelete?.()
        if (extra) collections.push(extra)
      } catch (error) {
        failed.push(collection)

        // A sweep that threw mid-window still deleted what the windows before
        // it selected, and the collection owes a row either way. `afterDelete`
        // throws past this branch, its row already pushed above.
        if (error instanceof SweepFailure) {
          collections.push({ collection, deleted: error.deleted })
        }

        req.payload.logger.error({
          msg: `CleanupCollections: ${collection} failed`,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const deleted = collections.reduce((total, count) => total + count.deleted, 0)

    if (deleted > 0) {
      req.payload.logger.info({
        msg: dryRun
          ? 'CleanupCollections: dry run — nothing was deleted'
          : 'CleanupCollections: retention sweep complete',
        deleted,
        collections,
      })
    }

    if (failed.length > 0) {
      throw new Error(`CleanupCollections: ${failed.join(', ')} failed — see the logged errors`)
    }

    return { output: { collections, deleted, dryRun } }
  },
}
