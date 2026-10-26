import type { CollectionSlug, PayloadRequest, Where } from 'payload'

import type { BeforeDelete, PurgeWindow } from '@/types/retention'

/** One window resolved against the run's clock. */
export interface DueWindow {
  name: string
  where: Where
}

/**
 * A window threw, carrying the rows the windows before it had already deleted.
 *
 * ⚠ A throw discards a return value, so without this the task reports no row
 * for the entry at all — which `tests/utils/retention.ts` reads as zero, the
 * same answer a collection with nothing due gets.
 */
export class SweepFailure extends Error {
  constructor(
    message: string,
    public readonly deleted: number,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'SweepFailure'
  }
}

/**
 * Resolve a collection's windows against one clock, once per run.
 *
 * The sweep and a collection's own hooks both ask what this run is about to
 * delete, so the cutoffs are computed here and handed to both rather than
 * derived twice from a date each side reads for itself.
 */
export const dueWindows = (windows: readonly PurgeWindow[], now: Date): DueWindow[] =>
  windows.map((window) => ({
    name: window.name,
    where: window.where(new Date(now.getTime() - window.days * 24 * 60 * 60 * 1000).toISOString()),
  }))

/**
 * Delete everything one collection's retention windows select, and report how
 * many rows went.
 *
 * The engine behind every collection's `custom.retention`: what they share is
 * the cutoff, the dry-run branch, and a delete whose partial failure is
 * reported rather than returned as a short count. What differs is the
 * declaration, which is a `custom` key rather than a task (#987).
 *
 * ⚠ **`beforeDelete` runs while the rows are still there.** A promise that
 * extends past the row itself — a contact message's retention is about the
 * person who sent it — cannot be re-derived once the only pointer to them is
 * gone, so a collection that owes one reads what it needs here.
 */
export async function sweepCollection(args: {
  beforeDelete?: BeforeDelete
  collection: CollectionSlug
  dryRun: boolean
  label: string
  req: PayloadRequest
  windows: readonly DueWindow[]
}): Promise<number> {
  const { beforeDelete, collection, dryRun, label, req, windows } = args
  let deleted = 0

  try {
    for (const { name, where } of windows) {
      await beforeDelete?.(where)

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
          window: name,
        })
      }

      deleted += docs.length
    }
  } catch (error) {
    throw new SweepFailure(error instanceof Error ? error.message : String(error), deleted, {
      cause: error,
    })
  }

  return deleted
}
