import type { TaskConfig, Where } from 'payload'

import { sweepRetention } from '@/lib/retention/sweep'
import type { PurgeWindow } from '@/lib/retention/sweep'
import { IMPORT_RETENTION_DAYS } from '@/plugins/eventImport/constants'

/**
 * One window for every status, because what sets it is the CSV: the file holds
 * the contact names, addresses and phone numbers a volunteer collected, and a
 * finished import keeps them no more legitimately than a failed one. Payload's
 * own upload delete removes the R2 object with the row.
 *
 * `updatedAt`, not `createdAt`: an import still being read is not swept from
 * under its owner.
 */
const IMPORT_WINDOWS: PurgeWindow[] = [
  {
    name: 'imports',
    days: IMPORT_RETENTION_DAYS,
    where: (cutoff): Where => ({ updatedAt: { less_than: cutoff } }),
  },
]

export const SweepEventImports: TaskConfig<'sweepEventImports'> = {
  slug: 'sweepEventImports',
  label: 'Sweep Event Imports',
  retries: 2,
  inputSchema: [
    { name: 'now', type: 'text' },
    { name: 'dryRun', type: 'checkbox' },
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
    const dryRun = input?.dryRun === true
    const deleted = await sweepRetention({
      collection: 'imports',
      dryRun,
      label: 'SweepEventImports',
      now,
      req,
      windows: IMPORT_WINDOWS,
    })
    if (deleted > 0) {
      req.payload.logger.info({
        msg: dryRun
          ? 'SweepEventImports: dry run — nothing was deleted'
          : 'SweepEventImports: retention sweep complete',
        deleted,
      })
    }
    return { output: { deleted } }
  },
}
