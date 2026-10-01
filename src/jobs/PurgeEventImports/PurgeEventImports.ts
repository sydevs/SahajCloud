import type { TaskConfig } from 'payload'

import { IMPORT_TRASH_RETENTION_DAYS } from '@/collections/EventImports/constants'

/**
 * Hard-deletes `event-imports` batches that have sat in the trash long enough.
 *
 * ⚠ **Payload has no built-in trash purge**, on any collection: `trash: true`
 * buys the `deletedAt` column and the admin's trash view, and nothing ever
 * empties it. `CleanupOrphanedMedia`'s phase A is the same sweep for files and
 * images; this is the one for import batches, which is the half that makes
 * "discard" mean the CSV goes away rather than merely leaves the list.
 *
 * A successful commit deletes its own batch outright, so what reaches this job
 * is a discarded batch and an abandoned one a manager trashed by hand.
 *
 * Runs on the existing `nightly` queue at 05:00 UTC, after the 02:00 event
 * expiry, the 03:00 notification sweeps and the 04:00 submissions purge, so no
 * two retention jobs contend.
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
      cron: '0 5 * * *', // daily at 05:00 UTC (after the 02:00–04:00 sweeps)
      queue: 'nightly',
    },
  ],
  handler: async ({ input, req }) => {
    const now = typeof input?.now === 'string' ? new Date(input.now) : new Date()
    const dryRun = input?.dryRun === true
    const cutoff = new Date(
      now.getTime() - IMPORT_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()
    const where = { deletedAt: { less_than_equal: cutoff } }

    // ⚠ `trash: true` on both calls, for two different reasons. The read needs
    // it because Payload appends `deletedAt exists: false` to every query on a
    // trash-enabled collection, so without it this sweep sees none of the rows
    // it exists to find. The delete needs it because a trashed row is otherwise
    // not a legal target — `Not Found`, on an id this very query returned
    // (`src/collections/AGENTS.md`, "Trashed docs are invisible to a default
    // query"). `payload.delete` is the hard delete either way.
    const { totalDocs: due } = await req.payload.count({
      collection: 'event-imports',
      where,
      trash: true,
      overrideAccess: true,
      req,
    })

    if (dryRun || due === 0) {
      if (due > 0) {
        req.payload.logger.info({
          msg: 'PurgeEventImports: dry run — nothing was deleted',
          deletedBatches: due,
          cutoff,
        })
      }
      return { output: { deletedBatches: due } }
    }

    const { docs, errors } = await req.payload.delete({
      collection: 'event-imports',
      where,
      trash: true,
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
