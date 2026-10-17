import type { TaskConfig, Where } from 'payload'

/**
 * How long a finished job row is kept. Long enough that a transcript's status
 * survives a weekend of nobody looking, short enough that the table stays a
 * recent-history table rather than an append-only log.
 */
export const JOB_RETENTION_DAYS = 7

/** The timestamp a finished job row has to predate to be swept. */
export const jobRetentionCutoff = (now: Date): string =>
  new Date(now.getTime() - JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

/**
 * Weekly sweep of finished `payload-jobs` rows.
 *
 * ⚠ **This is the other half of `deleteJobOnComplete: false`.** That flag is
 * global, so every queue's rows now survive their run and nothing but this
 * sweep bounds the table. Turning the flag back on would strip the status a
 * meditation transcript derives from its job row.
 *
 * Only a **finished** row is swept — completed, or errored with no retry left.
 * A queued row is old because its `waitUntil` has not arrived, and deleting it
 * would cancel work nobody asked to cancel.
 */
export const CleanupJobs: TaskConfig<'cleanupJobs'> = {
  slug: 'cleanupJobs',
  label: 'Cleanup Jobs',
  retries: 2,
  inputSchema: [
    {
      // Test seam: a spec asserts the window boundary without waiting a week.
      name: 'now',
      type: 'text',
    },
    {
      name: 'dryRun',
      type: 'checkbox',
    },
  ],
  outputSchema: [{ name: 'deletedJobs', type: 'number', required: true }],
  schedule: [
    {
      cron: '0 5 * * 0', // Sundays at 05:00 UTC, after the 02:00–04:00 nightly sweeps
      queue: 'nightly',
    },
  ],
  handler: async ({ input, req }) => {
    const now = typeof input?.now === 'string' ? new Date(input.now) : new Date()
    const cutoff = jobRetentionCutoff(now)
    const where: Where = {
      or: [
        { completedAt: { less_than: cutoff } },
        { and: [{ hasError: { equals: true } }, { updatedAt: { less_than: cutoff } }] },
      ],
    }

    if (input?.dryRun === true) {
      const { totalDocs } = await req.payload.count({
        collection: 'payload-jobs',
        where,
        overrideAccess: true,
        req,
      })
      return { output: { deletedJobs: totalDocs } }
    }

    const { docs, errors } = await req.payload.delete({
      collection: 'payload-jobs',
      where,
      overrideAccess: true,
      req,
    })

    // A short count would otherwise read as "nothing was due", and the table
    // would grow with no one learning why.
    if (errors.length > 0) {
      req.payload.logger.warn({
        msg: 'CleanupJobs: some job rows could not be deleted',
        count: errors.length,
        firstError: errors[0]?.message,
      })
    }

    return { output: { deletedJobs: docs.length } }
  },
}
