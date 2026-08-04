/**
 * Recompute the stored `qualityOpenCount` / `qualityCheckVersion` columns on
 * existing rows (#609).
 *
 * Both are written by the `stampEventQuality` beforeChange hook, so any event
 * saved since they shipped already has them. Rows written before then hold
 * NULL, which sorts as "no open items" and would put the worst listings at the
 * bottom of a list sorted by the column. The same pass re-stamps rows whose
 * `qualityCheckVersion` predates the current check definitions, since a count
 * produced by an older definition isn't comparable with a fresh one.
 *
 * Safe to leave un-run and safe to re-run: nothing reads the column for
 * correctness — the panel and every consumer compute the real report fresh —
 * and the count is a pure function of the stored document, so a second pass
 * finds nothing to do.
 *
 * Driven by `scripts/backfill-event-quality.ts`.
 */

import type { EventQualityInput } from './types'
import type { Payload } from 'payload'


import { QUALITY_CHECK_VERSION } from './checks'
import { countOpenDocumentIssues } from './report'

const BATCH_SIZE = 200

export interface QualityBackfillStats {
  scanned: number
  /** Rows whose stored count or version differed (written when `apply`). */
  changed: number
  unchanged: number
  failed: number
}

export interface QualityBackfillRowChange {
  id: number | string
  from: { openCount: number | null; version: number | null }
  to: { openCount: number; version: number }
  error?: string
}

/**
 * Recompute every event's stored quality columns, reporting each divergence via
 * `onChange`. Pass `apply: false` for a dry run.
 *
 * `skipVerifyHook` is essential — without it the Events `verifyOnSave` hook
 * would treat every backfilled row as a fresh verification and reset its whole
 * escalation cycle. The update sends no field data of its own: the values come
 * from `stampEventQuality`, which recomputes them from
 * `{ ...originalDoc, ...data }` on the way in, so the write and the hook agree
 * by construction and nothing else on the document is touched.
 */
export async function backfillEventQuality(args: {
  payload: Payload
  apply: boolean
  onChange?: (change: QualityBackfillRowChange) => void
}): Promise<QualityBackfillStats> {
  const { payload, apply, onChange } = args
  const stats: QualityBackfillStats = { scanned: 0, changed: 0, unchanged: 0, failed: 0 }

  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const batch = await payload.find({
      collection: 'events',
      depth: 0,
      limit: BATCH_SIZE,
      page,
      overrideAccess: true,
      // Include trashed events: one restored later should already be correct.
      trash: true,
    })

    for (const doc of batch.docs) {
      stats.scanned++
      const event = doc as EventQualityInput & {
        id: number | string
        qualityOpenCount?: number | null
        qualityCheckVersion?: number | null
      }

      const expectedCount = countOpenDocumentIssues(event)
      const storedCount = event.qualityOpenCount ?? null
      const storedVersion = event.qualityCheckVersion ?? null

      if (storedCount === expectedCount && storedVersion === QUALITY_CHECK_VERSION) {
        stats.unchanged++
        continue
      }

      const change: QualityBackfillRowChange = {
        id: event.id,
        from: { openCount: storedCount, version: storedVersion },
        to: { openCount: expectedCount, version: QUALITY_CHECK_VERSION },
      }

      if (!apply) {
        stats.changed++
        onChange?.(change)
        continue
      }

      try {
        await payload.update({
          collection: 'events',
          id: event.id,
          data: {},
          context: { skipVerifyHook: true },
          overrideAccess: true,
        })
        stats.changed++
        onChange?.(change)
      } catch (error) {
        stats.failed++
        onChange?.({ ...change, error: error instanceof Error ? error.message : String(error) })
      }
    }

    hasNextPage = batch.hasNextPage
    page++
  }

  return stats
}
