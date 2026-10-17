import type { CollectionSlug, PayloadRequest, SelectType, Where } from 'payload'

/** One sweep: what to delete, and what to call it in the log. */
export interface PurgeWindow {
  name: string
  days: number
  where: (cutoff: string) => Where
}

/**
 * Delete everything a collection's retention windows select, oldest-first by
 * window order, and report how many rows went.
 *
 * Shared by `purgeSubmissions` and `sweepEventImports`. The two stay separate
 * task declarations — the slugs, schedules, output shapes and the submissions
 * sweep's `users` half all differ — so what is shared is this loop and nothing
 * above it (#960).
 *
 * ⚠ **A `dryRun` counts what a real run would delete, so it must not delete.**
 * The rows are still there afterwards, which is what lets `purgeSubmissions`
 * answer "would this person's row survive" from the same pass.
 */
export async function sweepWindows(args: {
  req: PayloadRequest
  collection: CollectionSlug
  windows: readonly PurgeWindow[]
  now: Date
  dryRun?: boolean
  /** The log prefix, so a warning names the task a reader is looking at. */
  label: string
  /**
   * Read the due rows before deleting them, for a caller that needs something
   * off a row the delete takes with it — `purgeSubmissions` collects whose
   * `users` row to reconsider, which is only knowable while the pointer exists.
   */
  inspect?: {
    select: SelectType
    onDue: (docs: Record<string, unknown>[], window: PurgeWindow) => void
  }
}): Promise<number> {
  const { req, collection, windows, now, dryRun = false, label, inspect } = args
  let deleted = 0

  for (const window of windows) {
    const cutoff = new Date(now.getTime() - window.days * 24 * 60 * 60 * 1000).toISOString()
    const where = window.where(cutoff)

    if (inspect || dryRun) {
      // Both casts are the price of taking the collection as a value: Payload
      // types `select` and the returned rows per slug, and this loop is
      // deliberately agnostic about which one it was handed.
      const { docs: due } = await req.payload.find({
        collection,
        where,
        select: (inspect?.select ?? { id: true }) as never,
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
      inspect?.onDue(due as unknown as Record<string, unknown>[], window)
      if (dryRun) {
        deleted += due.length
        continue
      }
      if (due.length === 0) continue
    }

    const { docs, errors } = await req.payload.delete({
      collection,
      where,
      overrideAccess: true,
      req,
    })

    // A row that refuses to delete is worth a line — silently returning a short
    // count would read as "nothing was due", and the collection would grow
    // without anyone learning why.
    if (errors.length > 0) {
      req.payload.logger.warn({
        msg: `${label}: some rows could not be deleted`,
        window: window.name,
        count: errors.length,
        firstError: errors[0]?.message,
      })
    }

    deleted += docs.length
  }

  return deleted
}
