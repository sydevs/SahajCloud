import type { BeforeDelete, PurgeWindow } from './types'
import type { CollectionSlug, PayloadRequest } from 'payload'

/** The timestamp a row has to predate to fall inside a window. */
export const retentionCutoff = (now: Date, days: number): string =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

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
 * Delete everything one collection's retention windows select, and report how
 * many rows went.
 *
 * The engine behind every registry entry (`registry.ts`): what each collection
 * shares is the cutoff, the dry-run branch, and a delete whose partial failure
 * is reported rather than returned as a short count. What differs is the
 * declaration, which is a row rather than a task (#987).
 *
 * ⚠ **`beforeDelete` runs while the rows are still there.** A promise that
 * extends past the row itself — a contact message's retention is about the
 * person who sent it — cannot be re-derived once the only pointer to them is
 * gone, so an entry that owes one reads what it needs here.
 */
export async function sweepCollection(args: {
  beforeDelete?: BeforeDelete
  collection: CollectionSlug
  dryRun: boolean
  label: string
  now: Date
  req: PayloadRequest
  windows: readonly PurgeWindow[]
}): Promise<number> {
  const { beforeDelete, collection, dryRun, label, now, req, windows } = args
  let deleted = 0

  try {
    for (const window of windows) {
      const where = window.where(retentionCutoff(now, window.days))
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
          window: window.name,
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
