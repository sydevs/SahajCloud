/**
 * Recompute the derived `schedule.lastDate` column on existing rows (#603).
 *
 * `lastDate` is written by the `computeLastDate` field hook, so any row saved
 * since the column shipped already has it. Rows written before then hold NULL,
 * which reads as "this recurrence never ends" — so a finished event stays on the
 * public feeds until something recomputes it. This walks both collections built
 * on `scheduleFields()` and fixes them.
 *
 * Lives here rather than in the operator script because it spans two collections
 * (`events` + `app-cards`), so it belongs to neither one's folder.
 *
 * Safe to leave un-run and safe to re-run: the nightly `ExpireEvents` sweep
 * computes the finished-check from the schedule sub-fields directly and never
 * depended on this, and `lastOccurrenceEnd` is a pure function of the schedule
 * (no clock), so a second pass finds nothing to do.
 *
 * **A first pass can move a `lastDate` that looked fine, which is expected.**
 * `cleanupExpiredExclusions` strips exclusions more than a day past on *every*
 * write, including the original create — but `computeLastDate` runs against the
 * incoming patch, so it can apply an exclusion that the same write is removing.
 * The stored `lastDate` is then not reproducible from the stored sub-fields
 * (e.g. a trailing occurrence excluded at create yields the earlier date, while a
 * recompute afterwards yields the later one), and this pass rewrites it to the
 * reproducible value. Behaviourally inert: a stripped exclusion is by definition
 * past, so the occurrence it removed is past too — both candidates are behind
 * `now` and the event is finished either way.
 *
 * Driven by `scripts/backfill-schedule-last-date.ts`.
 */

import type { Payload } from 'payload'

import type { EventScheduleInput } from '@/types/schedule'

import { lastOccurrenceEnd } from './scheduleHooks'

/** Collections built on `scheduleFields()`. */
export const SCHEDULE_COLLECTIONS = ['events', 'app-cards'] as const
export type ScheduleCollection = (typeof SCHEDULE_COLLECTIONS)[number]

const BATCH_SIZE = 200

/** A schedule group as read off a document, plus the stored derived column. */
type StoredSchedule = EventScheduleInput & { lastDate?: string | null }

export interface BackfillStats {
  scanned: number
  /** Rows whose stored value differed (written when `apply`, else counted only). */
  changed: number
  unchanged: number
  /** Rows with no usable `firstDate` — nothing to compute. */
  skipped: number
  failed: number
}

export interface BackfillRowChange {
  collection: ScheduleCollection
  id: number | string
  from: string | null
  to: string | null
  error?: string
}

/** Whether a stored column value already matches the computed one. */
function matches(stored: string | null, expected: string | null): boolean {
  if (expected === null || stored === null) return stored === expected
  // Compare as instants: the column round-trips through Postgres and needn't be
  // byte-identical to the computed ISO string.
  return new Date(stored).getTime() === new Date(expected).getTime()
}

/**
 * Recompute one collection's `lastDate` values, reporting every divergence via
 * `onChange`. Pass `apply: false` for a dry run.
 *
 * Writes the **whole** schedule group back rather than a partial patch, so the
 * write can't depend on how Payload merges a partial group; `computeLastDate`
 * recomputes the value on the way in regardless, so the two agree by
 * construction. `skipVerifyHook` is essential — without it the Events
 * `verifyOnSave` hook would treat every backfilled row as a fresh verification
 * and reset its whole escalation cycle.
 */
export async function backfillScheduleLastDate(args: {
  payload: Payload
  collection: ScheduleCollection
  apply: boolean
  onChange?: (change: BackfillRowChange) => void
}): Promise<BackfillStats> {
  const { payload, collection, apply, onChange } = args
  const stats: BackfillStats = { scanned: 0, changed: 0, unchanged: 0, skipped: 0, failed: 0 }

  let page = 1
  let hasNextPage = true

  while (hasNextPage) {
    const batch = await payload.find({
      collection,
      depth: 0,
      limit: BATCH_SIZE,
      page,
      overrideAccess: true,
      // Include trashed events: one restored later should already be correct.
      ...(collection === 'events' ? { trash: true } : {}),
    })

    for (const doc of batch.docs) {
      stats.scanned++
      const schedule = (doc as { schedule?: StoredSchedule | null }).schedule

      if (!schedule?.firstDate) {
        stats.skipped++
        continue
      }

      const expected = lastOccurrenceEnd(schedule)
      const stored = schedule.lastDate ?? null

      if (matches(stored, expected)) {
        stats.unchanged++
        continue
      }

      const change: BackfillRowChange = { collection, id: doc.id, from: stored, to: expected }

      if (!apply) {
        stats.changed++
        onChange?.(change)
        continue
      }

      try {
        // Drop the virtual sub-fields — they aren't columns, so writing them back
        // would be meaningless noise.
        const {
          icalRule: _icalRule,
          upcomingDates: _upcomingDates,
          ...columns
        } = schedule as Record<string, unknown>
        await payload.update({
          collection,
          id: doc.id,
          data: { schedule: { ...columns, lastDate: expected } } as never,
          context: { skipVerifyHook: true },
          overrideAccess: true,
        })
        stats.changed++
        onChange?.(change)
      } catch (error) {
        stats.failed++
        onChange?.({
          ...change,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    hasNextPage = batch.hasNextPage
    page++
  }

  return stats
}
