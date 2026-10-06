import type { TaskConfig, Where } from 'payload'

import {
  ABANDONED_BATCH_DAYS,
  IMPORT_TRASH_RETENTION_DAYS,
} from '@/collections/EventImports/constants'
import { revalidateAtlasSidebar } from '@/lib/atlasSidebar/cache'
import { purgeCloudflareCache } from '@/plugins/cache/purge'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Hard-deletes `event-imports` batches that have sat in the trash long enough,
 * and batches nobody has touched in `ABANDONED_BATCH_DAYS`.
 *
 * ⚠ **Payload has no built-in trash purge**, on any collection: `trash: true`
 * buys the `deletedAt` column and the admin's trash view, and nothing ever
 * empties it. `CleanupOrphanedMedia` phase A is the same sweep for media; this
 * is what makes "discard" mean the CSV goes away rather than leaves the list.
 *
 * What reaches the trash half is a discarded batch, and a finished one — the
 * finish trashes a committed batch as its report (`commit/finish.ts`).
 *
 * ⚠ **An abandoned batch part-way through its commit is paid back first.** Its
 * classes went in with cache invalidation deferred to a finish that never ran,
 * so the edge and the sidebar are purged before the batch goes.
 */
export const PurgeEventImports: TaskConfig<'purgeEventImports'> = {
  slug: 'purgeEventImports',
  label: 'Purge Event Imports',
  retries: 2,
  inputSchema: [
    {
      // Test seam: a spec injects the clock so it can assert the window
      // boundary without waiting a week. Absent in production, where `now` is
      // now.
      name: 'now',
      type: 'text',
    },
    {
      // Reports what would go, and deletes nothing.
      name: 'dryRun',
      type: 'checkbox',
    },
  ],
  outputSchema: [{ name: 'deletedBatches', type: 'number', required: true }],
  schedule: [
    {
      cron: '0 5 * * *', // after the 02:00–04:00 sweeps, so no two contend
      queue: 'nightly',
    },
  ],
  handler: async ({ input, req }) => {
    const now = typeof input?.now === 'string' ? new Date(input.now) : new Date()
    const dryRun = input?.dryRun === true
    const cutoff = new Date(now.getTime() - IMPORT_TRASH_RETENTION_DAYS * DAY_MS).toISOString()
    const abandonedCutoff = new Date(now.getTime() - ABANDONED_BATCH_DAYS * DAY_MS).toISOString()
    const abandoned: Where = {
      and: [{ deletedAt: { exists: false } }, { updatedAt: { less_than_equal: abandonedCutoff } }],
    }
    const where: Where = { or: [{ deletedAt: { less_than_equal: cutoff } }, abandoned] }

    // ⚠ `trash: true` on every call here: without it Payload appends
    // `deletedAt exists: false` and the sweep sees none of the rows it exists to
    // find, and a trashed row is `Not Found` as a delete target
    // (`src/collections/AGENTS.md`). `payload.delete` is the hard delete either
    // way.
    if (dryRun) {
      const { totalDocs } = await req.payload.count({
        collection: 'event-imports',
        where,
        trash: true,
        overrideAccess: true,
        req,
      })
      if (totalDocs > 0) {
        req.payload.logger.info({
          msg: 'PurgeEventImports: dry run — nothing was deleted',
          deletedBatches: totalDocs,
          cutoff,
        })
      }
      return { output: { deletedBatches: totalDocs } }
    }

    const { totalDocs: halfCommitted } = await req.payload.count({
      collection: 'event-imports',
      where: { and: [abandoned, { status: { equals: 'committing' } }] },
      overrideAccess: true,
      req,
    })
    if (halfCommitted > 0) {
      await purgeCloudflareCache({ tags: ['events', 'regions'] }, { logger: req.payload.logger })
      revalidateAtlasSidebar()
    }

    const { docs, errors } = await req.payload.delete({
      collection: 'event-imports',
      where,
      trash: true,
      // The handler wants the count, not the batches. Without a `select` the
      // delete hydrates every `rows` column it is about to destroy — up to 500
      // rows of CSV per batch — and walks each through the afterRead field
      // hooks, to produce one integer. `id` is not a selectable key; Payload
      // returns it either way.
      select: { status: true },
      overrideAccess: true,
      req,
    })

    // A row that refuses to delete is worth a line: returning a short count
    // silently would read as "nothing was due", and the uploaded CSVs would
    // accumulate with nobody learning why.
    if (errors.length > 0) {
      req.payload.logger.warn({
        msg: 'PurgeEventImports: some batches could not be deleted',
        count: errors.length,
        firstError: errors[0]?.message,
      })
    }

    if (docs.length > 0) {
      req.payload.logger.info({
        msg: 'PurgeEventImports: retention sweep complete',
        deletedBatches: docs.length,
        cutoff,
      })
    }

    return { output: { deletedBatches: docs.length } }
  },
}
