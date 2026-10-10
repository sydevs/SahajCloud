import type { TaskConfig } from 'payload'

import { IMPORT_RETENTION_DAYS } from '@/collections/EventImports/constants'

/**
 * Nightly retention sweep for `event-imports`: every discarded batch, and every
 * batch untouched for `IMPORT_RETENTION_DAYS`.
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
    const cutoff = new Date(
      now.getTime() - IMPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()

    const { docs, errors } = await req.payload.delete({
      collection: 'event-imports',
      where: {
        or: [{ status: { equals: 'discarded' } }, { updatedAt: { less_than: cutoff } }],
      },
      overrideAccess: true,
      req,
    })

    // A batch that refuses to delete is worth a line — silently returning a
    // short count would read as "nothing was due", and the collection would grow
    // with its CSVs without anyone learning why.
    if (errors.length > 0) {
      req.payload.logger.warn({
        msg: 'SweepEventImports: some batches could not be deleted',
        count: errors.length,
        firstError: errors[0]?.message,
      })
    }

    if (docs.length > 0) {
      req.payload.logger.info({
        msg: 'SweepEventImports: retention sweep complete',
        deleted: docs.length,
      })
    }

    return { output: { deleted: docs.length } }
  },
}
