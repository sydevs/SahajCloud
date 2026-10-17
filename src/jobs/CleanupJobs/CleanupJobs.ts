import type { TaskConfig, Where } from 'payload'

import { type PurgeWindow, sweepRetention } from '@/lib/retention/sweep'

/**
 * How long a finished job row is kept. Long enough that a transcript's status
 * survives a weekend of nobody looking, short enough that the table stays a
 * recent-history table rather than an append-only log.
 */
export const JOB_RETENTION_DAYS = 7

/**
 * The one window, and why it names two markers rather than a date alone.
 *
 * Only a **finished** row is swept — completed, or errored with no retry left.
 * A queued row is old because its `waitUntil` has not arrived, and deleting it
 * would cancel work nobody asked to cancel. A queued row carries neither
 * marker, so it is unreachable from here rather than excluded by a clause.
 */
export const JOB_PURGE_WINDOWS: PurgeWindow[] = [
  {
    days: JOB_RETENTION_DAYS,
    name: 'finishedJobs',
    where: (cutoff): Where => ({
      or: [
        { completedAt: { less_than: cutoff } },
        { and: [{ hasError: { equals: true } }, { updatedAt: { less_than: cutoff } }] },
      ],
    }),
  },
]

/**
 * Weekly sweep of finished `payload-jobs` rows.
 *
 * ⚠ **This is the other half of `deleteJobOnComplete: false`.** That flag is
 * global, so every queue's rows now survive their run and nothing but this
 * sweep bounds the table. Turning the flag back on would strip the status a
 * meditation transcript derives from its job row.
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
    const deletedJobs = await sweepRetention({
      collection: 'payload-jobs',
      dryRun: input?.dryRun === true,
      label: 'CleanupJobs',
      now: typeof input?.now === 'string' ? new Date(input.now) : new Date(),
      req,
      windows: JOB_PURGE_WINDOWS,
    })

    return { output: { deletedJobs } }
  },
}
