import type { TaskConfig } from 'payload'

import { recoverLostJobs } from '@/lib/jobs/recoverLostJobs'

/**
 * The hourly sweep for a container that died mid-job.
 *
 * ⚠ **`payload.config.ts` runs the same routine on boot, and that call is not
 * redundant.** `defaultBeforeSchedule` will not queue a scheduled task while one
 * of its own rows is runnable or active, so a sweep lost mid-run blocks every
 * later sweep. Only a dead process leaves a row that way, and whatever replaces
 * it boots — which is why boot is enough, and why it has to stay.
 *
 * `nightly` is the hourly queue, despite the name.
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
