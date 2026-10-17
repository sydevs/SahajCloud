import type { TaskConfig, Where } from 'payload'

import { IMPORT_RETENTION_DAYS } from '@/collections/EventImports/constants'
import { sweepRetention } from '@/lib/retention/sweep'
import type { PurgeWindow } from '@/lib/retention/sweep'

/**
 * The one window, and why there is only one.
 *
 * ⚠ **One window for every status, because what sets it is the CSV.** The file
 * holds the contact names, addresses and phone numbers a volunteer collected,
 * and a finished batch keeps them no more legitimately than a failed one. There
 * is no trash stage: `event-imports` has no `trash`, so the delete is the
 * delete, and Payload's own upload delete removes the R2 object with the row.
 *
 * ⚠ **`updatedAt`, not `createdAt`.** A batch somebody is still working — a
 * re-upload, a review left open over a weekend — must not be swept out from
 * under them, and `updatedAt` is what the jobs and the reviewer both move.
 */
const IMPORT_WINDOWS: PurgeWindow[] = [
  {
    name: 'batches',
    days: IMPORT_RETENTION_DAYS,
    where: (cutoff) => {
      const clauses: Where[] = [
        { status: { equals: 'discarded' } },
        { updatedAt: { less_than: cutoff } },
      ]
      return { or: clauses }
    },
  },
]

/**
 * Nightly retention sweep for `event-imports`: every discarded batch, and every
 * batch untouched for `IMPORT_RETENTION_DAYS`.
 *
 * The loop is `@/lib/retention/sweep`, shared with `purgeSubmissions` and
 * `cleanupJobs` (#960). This stays its own task because the slug, the schedule
 * and the output shape are its own, and because the submissions sweep has a
 * `users` half this has no analogue for.
 *
 * Runs on `nightly` at 04:30 UTC, after `purgeSubmissions` at 04:00, so a slow
 * night does not have two retention sweeps contending.
 */
export const SweepEventImports: TaskConfig<'sweepEventImports'> = {
  slug: 'sweepEventImports',
  label: 'Sweep Event Imports',
  retries: 2,
  inputSchema: [
    {
      // Test seam: specs inject the clock so they can assert the window
      // boundary without waiting thirty days. Absent in production.
      name: 'now',
      type: 'text',
    },
  ],
  outputSchema: [{ name: 'deleted', type: 'number', required: true }],
  schedule: [
    {
      cron: '30 4 * * *', // daily at 04:30 UTC, after the submissions purge
      queue: 'nightly',
    },
  ],
  handler: async ({ input, req }) => {
    const now = typeof input?.now === 'string' ? new Date(input.now) : new Date()

    const deleted = await sweepRetention({
      collection: 'event-imports',
      dryRun: false,
      label: 'SweepEventImports',
      now,
      req,
      windows: IMPORT_WINDOWS,
    })

    if (deleted > 0) {
      req.payload.logger.info({
        msg: 'SweepEventImports: retention sweep complete',
        deleted,
      })
    }

    return { output: { deleted } }
  },
}
