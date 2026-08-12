/**
 * Arm the retention watermark on `finished` events written before it existed.
 *
 * A finished event is trashed 6 months after its schedule ends, and — like
 * every other transition — the ExpireEvents job finds it through one query,
 * `nextCheckAt <= now`. Rows finished before that rule shipped hold
 * `nextCheckAt: null` (the old `finishEvent` cleared it, and the Atlas importer
 * omitted it for `status: 6` rows), which now reads as "never look at this
 * again" — so without this pass they would sit in the finished state forever.
 *
 * Safe to leave un-run and safe to re-run: an un-armed row is inert (a finished
 * event is already absent from the public feeds), and `resolveNextCheckAt` is a
 * pure function of the schedule, so a second pass finds nothing to do. Rows
 * whose schedule never ends stay null — correct, since there is no date to
 * measure retention from.
 *
 * Driven by `scripts/backfill-finished-retention.ts`.
 */

import type { Payload } from 'payload'

import type { EventScheduleInput } from '@/types/schedule'

import { resolveNextCheckAt } from './periods'

const BATCH_SIZE = 200

export interface RetentionBackfillStats {
  scanned: number
  /** Rows given a retention date (written when `apply`, else counted only). */
  armed: number
  /** Rows with no computable schedule end — nothing to measure retention from. */
  skipped: number
  failed: number
}

export interface RetentionBackfillChange {
  id: number | string
  to: string
  error?: string
}

/**
 * Give every un-armed `finished` event its retention deadline. Pass
 * `apply: false` for a dry run.
 *
 * Trashed rows are included: one restored later should already carry the right
 * watermark. `skipVerifyHook` is essential — without it `verifyOnSave` would
 * treat each backfilled row as a fresh verification and drag it out of the
 * finished state entirely.
 */
export async function backfillFinishedRetention(args: {
  payload: Payload
  apply: boolean
  onChange?: (change: RetentionBackfillChange) => void
}): Promise<RetentionBackfillStats> {
  const { payload, apply, onChange } = args
  const stats: RetentionBackfillStats = { scanned: 0, armed: 0, skipped: 0, failed: 0 }

  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const batch = await payload.find({
      collection: 'events',
      where: {
        and: [{ verificationStage: { equals: 'finished' } }, { nextCheckAt: { exists: false } }],
      },
      depth: 0,
      limit: BATCH_SIZE,
      page,
      overrideAccess: true,
      trash: true,
    })

    for (const doc of batch.docs) {
      stats.scanned++

      const retentionAt = resolveNextCheckAt({
        stage: 'finished',
        schedule: doc.schedule as EventScheduleInput | null | undefined,
        inactive: doc.inactive,
      })

      if (!retentionAt) {
        stats.skipped++
        continue
      }

      if (!apply) {
        stats.armed++
        onChange?.({ id: doc.id, to: retentionAt })
        continue
      }

      try {
        await payload.update({
          collection: 'events',
          id: doc.id,
          data: { nextCheckAt: retentionAt },
          context: { skipVerifyHook: true },
          overrideAccess: true,
          trash: true,
        })
        stats.armed++
        onChange?.({ id: doc.id, to: retentionAt })
      } catch (error) {
        stats.failed++
        onChange?.({
          id: doc.id,
          to: retentionAt,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Applying removes rows from the result set, so the same page number keeps
    // returning fresh work; only a dry run advances through pages.
    hasNextPage = batch.hasNextPage
    if (!apply) page++
  }

  return stats
}
