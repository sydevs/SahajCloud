import type { CollectionSlug, PayloadRequest, Where } from 'payload'

/** One sweep: what to delete, and what to call it in the log. */
export interface PurgeWindow {
  days: number
  name: string
  where: (cutoff: string) => Where
}

/** The timestamp a row has to predate to fall inside a window. */
export const retentionCutoff = (now: Date, days: number): string =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

/**
 * Delete everything one collection's retention windows select, and report how
 * many rows went.
 *
 * Two sweeps run through here and neither can be the other: the slugs,
 * schedules and output shapes differ, and `user-submissions` carries a second
 * half — the `users` orphan sweep — that `payload-jobs` has no analogue for. So
 * this is the engine, not the task: what is shared is the cutoff, the dry-run
 * branch, and a delete whose partial failure is reported rather than returned
 * as a short count.
 *
 * ⚠ **`beforeDelete` runs while the rows are still there.** A promise that
 * extends past the row itself — a contact message's retention is about the
 * person who sent it — cannot be re-derived once the only pointer to them is
 * gone, so a sweep that owes one reads what it needs here.
 */
export async function sweepRetention(args: {
  beforeDelete?: (window: PurgeWindow, where: Where) => Promise<void>
  collection: CollectionSlug
  dryRun: boolean
  label: string
  now: Date
  req: PayloadRequest
  windows: readonly PurgeWindow[]
}): Promise<number> {
  const { beforeDelete, collection, dryRun, label, now, req, windows } = args
  let deleted = 0

  for (const window of windows) {
    const where = window.where(retentionCutoff(now, window.days))
    await beforeDelete?.(window, where)

    if (dryRun) {
      const { totalDocs } = await req.payload.count({
        collection,
        where,
        overrideAccess: true,
        req,
      })
      deleted += totalDocs
      continue
    }

    const { docs, errors } = await req.payload.delete({
      collection,
      where,
      overrideAccess: true,
      req,
    })

    // A short count would otherwise read as "nothing was due", and the table
    // would grow with no one learning why.
    if (errors.length > 0) {
      req.payload.logger.warn({
        msg: `${label}: some rows could not be deleted`,
        count: errors.length,
        firstError: errors[0]?.message,
        window: window.name,
      })
    }

    deleted += docs.length
  }

  return deleted
}
