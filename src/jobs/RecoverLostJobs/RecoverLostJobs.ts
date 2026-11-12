import type { Payload, TaskConfig } from 'payload'

import { cancelStaleJobs, STALE_JOB_MS } from '@/collections/PayloadJobs/PayloadJobs'
import { failLostImports } from '@/plugins/eventImport'

const SLUG = 'recoverLostJobs'

/** `payload` exports no `BeforeScheduleFn`, so it is read off the config it lives on. */
type BeforeSchedule = NonNullable<
  NonNullable<NonNullable<TaskConfig<typeof SLUG>['schedule']>[number]['hooks']>['beforeSchedule']
>

/**
 * Queue the sweep even while a lost run of it still sits `processing`.
 *
 * `defaultBeforeSchedule` counts such a row as active and refuses, and this
 * sweep is the only thing that ever settles one — so the schedule would never
 * be consulted again, with no error and no job row to show for it. Past
 * {@link STALE_JOB_MS} a `processing` row is no longer evidence of a live run,
 * so it stops blocking here. The run this lets through is what cancels it: a
 * window says which rows are lost, and a write is what recovers one.
 *
 * ⚠ **Delegate first, and only narrow the refusal.** The count below mirrors
 * `defaultBeforeSchedule`'s own, minus the rows past the window, so that
 * function stays the authority on every other reason not to queue.
 */
const scheduleUnlessRunning: BeforeSchedule = async (args) => {
  const scheduled = await args.defaultBeforeSchedule(args)
  if (scheduled.shouldSchedule) return scheduled

  const { totalDocs } = await args.req.payload.count({
    collection: 'payload-jobs',
    req: args.req,
    overrideAccess: true,
    where: {
      and: [
        { taskSlug: { equals: SLUG } },
        { queue: { equals: args.queueable.scheduleConfig.queue } },
        { completedAt: { exists: false } },
        { error: { exists: false } },
        { 'meta.scheduled': { equals: true } },
        {
          or: [
            { processing: { equals: false } },
            {
              updatedAt: {
                greater_than_equal: new Date(Date.now() - STALE_JOB_MS).toISOString(),
              },
            },
          ],
        },
      ],
    },
  })

  return totalDocs === 0 ? { ...scheduled, shouldSchedule: true } : scheduled
}

/**
 * Cancel the rows a lost run left `processing`, then settle the documents those
 * runs owned, and answer how many rows were swept.
 *
 * Cancelling alone frees the queue and tells nobody. A document whose status
 * the run writes still reads as in progress, because the write that would have
 * settled it died with the container — so the two steps are one routine.
 */
export async function recoverLostJobs(payload: Payload): Promise<number> {
  const cancelled = await cancelStaleJobs(payload)
  await failLostImports(payload, cancelled)
  return cancelled.length
}

/**
 * The hourly sweep for a container that died mid-job.
 *
 * `nightly` is the hourly queue, despite the name.
 */
export const RecoverLostJobs: TaskConfig<'recoverLostJobs'> = {
  slug: SLUG,
  label: 'Recover Lost Jobs',
  // The next hour's run is the retry, and it re-reads the world first.
  retries: 0,
  outputSchema: [{ name: 'cancelled', type: 'number', required: true }],
  schedule: [
    {
      // The `nightly` tick's own minute, deliberately: an aligned schedule is
      // queued and run by one tick, so the sweep is never a tick late
      // (`queues.ts`).
      cron: '0 * * * *',
      queue: 'nightly',
      hooks: { beforeSchedule: scheduleUnlessRunning },
    },
  ],
  handler: async ({ req }) => ({ output: { cancelled: await recoverLostJobs(req.payload) } }),
}
