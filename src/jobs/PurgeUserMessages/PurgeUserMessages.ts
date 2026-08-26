import type { PayloadRequest, TaskConfig } from 'payload'

import type { MessageStatus } from '@/collections/UserMessages/statuses'

/**
 * How long a **delivered** message is kept. Short on purpose: #602 stored
 * nothing at all, and persisting was accepted only because screening needs
 * history to compare against. A week keeps that promise as nearly as a
 * persisted intake can — the email has gone out, an admin has had time to see
 * the row, and the two 24-hour screening windows are long since satisfied.
 *
 * **Lower bound**: this must stay comfortably above `HISTORY_WINDOW_HOURS`, or
 * the repeat-sender and duplicate-body checks would be counting against rows
 * that had already been deleted — they would silently pass everything, with no
 * error anywhere. Exported so `tests/unit/user-message-screening.spec.ts` can
 * pin that relationship; nothing else reads it.
 */
export const DELIVERED_RETENTION_DAYS = 7

/**
 * How long **spam** is kept. Longer, because it is evidence: a sender's history
 * is what makes a pattern visible. Not forever, though — abuse tracking has a
 * shelf life, and bounding it is the entire point of having a retention policy.
 */
export const SPAM_RETENTION_DAYS = 90

/**
 * `failed` is deliberately absent. It means we accepted a message, told the
 * sender nothing, and never delivered it — the one state where deleting the row
 * destroys the only record that anything went wrong. It stays until an admin
 * resolves it.
 */
const RETENTION: Partial<Record<MessageStatus, number>> = {
  delivered: DELIVERED_RETENTION_DAYS,
  spam: SPAM_RETENTION_DAYS,
}

/**
 * Nightly retention sweep for `user-messages` (#632).
 *
 * Runs on the existing `nightly` queue at 04:00 UTC — after the 02:00 event
 * expiry and 03:00 notification sweeps, so a slow night doesn't have three jobs
 * contending. (`monthly` has no autoRun entry in `payload.config.ts`, so a task
 * scheduled there would never fire.)
 */
export const PurgeUserMessages: TaskConfig<'purgeUserMessages'> = {
  slug: 'purgeUserMessages',
  label: 'Purge User Messages',
  retries: 2,
  inputSchema: [
    {
      // Test seam: specs inject the clock so they can assert a window boundary
      // without waiting a week. Absent in production, where `now` is now.
      name: 'now',
      type: 'text',
    },
  ],
  outputSchema: [
    { name: 'deletedDelivered', type: 'number', required: true },
    { name: 'deletedSpam', type: 'number', required: true },
  ],
  schedule: [
    {
      cron: '0 4 * * *', // daily at 04:00 UTC (after the 02:00/03:00 sweeps)
      queue: 'nightly',
    },
  ],
  handler: async ({ input, req }) => {
    const now = typeof input?.now === 'string' ? new Date(input.now) : new Date()

    const deletedDelivered = await purge(req, 'delivered', now)
    const deletedSpam = await purge(req, 'spam', now)

    if (deletedDelivered + deletedSpam > 0) {
      req.payload.logger.info({
        msg: 'PurgeUserMessages: retention sweep complete',
        deletedDelivered,
        deletedSpam,
      })
    }

    return { output: { deletedDelivered, deletedSpam } }
  },
}

/** Delete every message in one status older than its window; returns the count. */
async function purge(req: PayloadRequest, status: MessageStatus, now: Date): Promise<number> {
  const days = RETENTION[status]
  if (days == null) return 0

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  const { docs, errors } = await req.payload.delete({
    collection: 'user-messages',
    where: {
      status: { equals: status },
      createdAt: { less_than: cutoff.toISOString() },
    },
    overrideAccess: true,
    req,
  })

  // A row that refuses to delete is worth a line — silently returning a short
  // count would read as "nothing was due", and the collection would grow
  // without anyone learning why.
  if (errors.length > 0) {
    req.payload.logger.warn({
      msg: 'PurgeUserMessages: some messages could not be deleted',
      status,
      count: errors.length,
      firstError: errors[0]?.message,
    })
  }

  return docs.length
}
