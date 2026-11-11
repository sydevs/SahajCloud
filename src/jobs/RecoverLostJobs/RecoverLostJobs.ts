import type { Payload, TaskConfig } from 'payload'

import { cancelStaleJobs } from '@/collections/PayloadJobs/PayloadJobs'
import { failInterruptedImports } from '@/plugins/eventImport'

/**
 * Cancel the rows a lost run left `processing`, then settle the documents
 * those runs owned.
 *
 * Cancelling alone frees the queue; it tells nobody. A document whose status
 * the run writes — a class import — still reads as in progress, because the
 * write that would have settled it died with the container. So the two steps
 * belong to one routine, and every caller gets both.
 *
 * A collection deriving its status from the job row needs nothing here:
 * `transcripts` reads `hasError` off the row itself, so the cancel is the whole
 * recovery (`@/collections/Transcripts/status`).
 */
export async function recoverLostJobs(payload: Payload): Promise<number> {
  const cancelled = await cancelStaleJobs(payload)
  await failInterruptedImports(payload, cancelled)
  return cancelled.length
}

/**
 * The hourly sweep for a container that died mid-job.
 *
 * ⚠ **`payload.config.ts` still runs this on boot, and that call is not
 * redundant.** `defaultBeforeSchedule` refuses to queue a scheduled task while
 * one of its own rows is runnable or active, so a sweep lost to a restart
 * blocks the next sweep for good. Boot is the only thing left that can clear
 * it.
 *
 * `nightly` is the hourly queue, and `STALE_JOB_MS` is what decides a lost run
 * either way — so the cadence costs a dead row at most one extra hour, never a
 * live one its cancel (`@/collections/PayloadJobs/PayloadJobs`).
 */
export const RecoverLostJobs: TaskConfig<'recoverLostJobs'> = {
  slug: 'recoverLostJobs',
  label: 'Recover Lost Jobs',
  // The next hour's run is the retry, and it re-reads the world first.
  retries: 0,
  outputSchema: [{ name: 'cancelled', type: 'number', required: true }],
  schedule: [{ cron: '0 * * * *', queue: 'nightly' }],
  handler: async ({ req }) => ({ output: { cancelled: await recoverLostJobs(req.payload) } }),
}
