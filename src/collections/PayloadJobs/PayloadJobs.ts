import type { CollectionConfig, Payload, PayloadRequest, Where } from 'payload'

import { isAdminManager } from '@/plugins/access/adminOnly'
import type { PurgeWindow, RetentionConfig } from '@/types/retention'

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

/**
 * How long a `processing` row may stand before a boot treats it as dead.
 *
 * ⚠ **This measures time since pick-up, not time since a sign of life.**
 * Payload writes the row when it claims it and again when it finishes, and
 * nothing in between for a plain task — only a workflow writes between its
 * steps. So the window has to clear the longest run a *healthy* task can have,
 * or a boot cancels one still working: the row then reads `hasError` and the
 * week-long window above sweeps the evidence of the cancel with it.
 *
 * An hour is four times the longest bound anything here declares —
 * `IMPORT_STALL_MS` (15 min, sized for a 500-row class import) and Lemonfox's
 * 5-minute request timeout, the two least bounded bodies. `job-retention.spec.ts`
 * holds it above the former, so a job that can legitimately run longer has to
 * raise this rather than lose a run to it.
 */
export const STALE_JOB_MS = 60 * 60 * 1000

/**
 * Cancel every job a dead container left `processing`, so its schedule runs
 * again. Payload never recovers such a row, and while it stands
 * `countRunnableOrActiveJobsForQueue` stops its schedule queueing another. A
 * cancelled row is `hasError`, so the window above sweeps it. Logs rather than
 * throws: a failed cleanup must not stop the server starting.
 *
 * ⚠ **Runs on every boot, and deliberately gates on the window alone.** A boot
 * is not proof the row's owner died — a rolling deploy starts this container
 * while the old one is still finishing its job, and a dev restart shares the
 * database with nothing else. {@link STALE_JOB_MS} is the whole discriminator,
 * which is why it is not shorter.
 */
export async function cancelStaleJobs(payload: Payload): Promise<void> {
  const before = new Date(Date.now() - STALE_JOB_MS).toISOString()
  await payload.jobs
    .cancel({
      where: { and: [{ processing: { equals: true } }, { updatedAt: { less_than: before } }] },
    })
    .catch((err: unknown) => payload.logger.error({ err, msg: 'Could not cancel stale jobs' }))
}
