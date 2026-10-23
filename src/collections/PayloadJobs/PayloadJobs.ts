import type { CollectionConfig, PayloadRequest, Where } from 'payload'

import type { PurgeWindow, RetentionConfig } from '@/lib/retention'
import { isAdminManager } from '@/plugins/access/adminOnly'

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
 * The only place `payload-jobs` is configured by this app.
 *
 * Payload builds that collection itself, so retention cannot be declared on a
 * schema file the way every other swept collection declares it. `@experimental`
 * `jobs.jobsCollectionOverrides` hands the built collection over to be
 * replaced, which is the one seam that reaches its `custom` (#987).
 *
 * ⚠ **This window is the other half of `deleteJobOnComplete: false`.** That
 * flag is global, so every queue's rows now survive their run and nothing but
 * this window bounds the table. Turning the flag back on would strip the status
 * a meditation transcript derives from its job row.
 *
 * ⚠ **This sweep ran weekly until #987 and now runs nightly with the rest.**
 * One task carries one schedule, and `JOB_RETENTION_DAYS` is what bounds what
 * goes either way: a row still lives its full week, it just stops surviving the
 * extra nought-to-seven days until the next Sunday. Nothing here was tuned to
 * the weekly cadence — the window was, and it is unchanged.
 *
 * ⚠ **Spread the collection rather than rebuilding it.** Payload sanitizes
 * whatever comes back as the whole jobs collection, so a missing field is a
 * missing column. Adding a hook here would also need `jobs.runHooks`, which the
 * app does not set — Payload warns and the hook never runs.
 */
export const payloadJobsOverrides = ({
  defaultJobsCollection,
}: {
  defaultJobsCollection: CollectionConfig
}): CollectionConfig => ({
  ...defaultJobsCollection,
  admin: {
    ...defaultJobsCollection.admin,
    // Payload ships this collection `hidden: true`, which also unregisters its
    // routes — so the Jobs UI an operator queues a sweep or a dry run from was
    // reachable by nobody. Access is admin-only already
    // (`restrictPayloadSystemEntities`), and this is the nav half of the same
    // answer: `admin.hidden` takes the user, so a non-admin sees neither the
    // sidebar entry nor the route.
    //
    // ⚠ `accessPlugin` never sees `payload-jobs`, so nothing composes project
    // visibility over this the way `createHidden` does elsewhere.
    hidden: ({ user }: { user: unknown }) => !isAdminManager(user as PayloadRequest['user']),
  },
  custom: {
    ...defaultJobsCollection.custom,
    retention: { windows: JOB_PURGE_WINDOWS } satisfies RetentionConfig,
  },
})
