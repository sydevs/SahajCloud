import type { RetentionEntry } from '../registry'
import type { PurgeWindow } from '../sweepCollection'
import type { Where } from 'payload'

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
 * ⚠ **This is the other half of `deleteJobOnComplete: false`.** That flag is
 * global, so every queue's rows now survive their run and nothing but this
 * window bounds the table. Turning the flag back on would strip the status a
 * meditation transcript derives from its job row.
 *
 * ⚠ **This sweep ran weekly until #987 and now runs nightly with the rest.**
 * One task carries one schedule, and `JOB_RETENTION_DAYS` is what bounds what
 * goes either way: a row still lives its full week, it just stops surviving the
 * extra nought-to-seven days until the next Sunday. Nothing here was tuned to
 * the weekly cadence — the window was, and it is unchanged.
 */
export const payloadJobsEntry: RetentionEntry = {
  collection: 'payload-jobs',
  windows: JOB_PURGE_WINDOWS,
}
