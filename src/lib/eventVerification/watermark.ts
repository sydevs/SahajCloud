/**
 * The `nextCheckAt` watermark rule — the single definition of "when does the
 * ExpireEvents job next need to look at this event", shared by every writer:
 * the verify op, the save hook, the job's own stage advances, and the Atlas
 * importer.
 *
 * Kept apart from the cadence helpers in `./periods` (which it consumes as one
 * input) because this is the load-bearing rule: the job's only query is
 * `nextCheckAt <= now`, so a transition exists if and only if it is expressed
 * here.
 */

import { lastOccurrenceEnd } from '@/lib/schedule/scheduleHooks'
import type { EventScheduleInput } from '@/types/schedule'

import { isUnmanagedStage, type VerificationStage } from './stages'

/**
 * How long a `finished` event's page keeps resolving before the retention
 * transition trashes it: 6 months after the end of its schedule. A finished
 * event stays published so old Atlas links keep working (#603) — but not
 * forever; after this window the listing is stale clutter.
 */
export const FINISHED_RETENTION_MONTHS = 6

/** Add whole months to `from` (calendar-aware, so it lands on the same day-of-month). */
function addMonths(from: Date, months: number): Date {
  const result = new Date(from)
  result.setUTCMonth(result.getUTCMonth() + months)
  return result
}

export interface NextCheckAtInput {
  /** The stage the event is landing on. */
  stage: VerificationStage
  /**
   * When this stage's own clock runs out — the re-verification date for a
   * managed event, or the next reminder step. Omitted for stages whose only
   * deadline comes from the schedule.
   */
  stageDeadline?: Date | null
  /** The event's schedule (merged, if this is a partial write). */
  schedule?: EventScheduleInput | null
  inactive?: boolean | null
}

/**
 * The next moment the ExpireEvents job must look at this event — `null` when
 * it never needs looking at again.
 *
 * `nextCheckAt` is a **watermark**, not a reminder date: the job's only query
 * is `nextCheckAt <= now`, so a stage transition is reachable if and only if
 * it's expressed here. That's what keeps the sweep cheap however large the
 * table grows — every non-actionable row is future-dated or null, so the
 * index range in the past holds only work that is genuinely due. (The
 * alternative, querying `schedule.lastDate < now`, matches every event that
 * ever ended, forever.)
 *
 * The three rules:
 *
 * - **Pre-adoption** (`unverified` / `denied`) — no manager, so no cadence;
 *   the only thing that can happen is the schedule running out.
 * - **Ladder stages** — the earlier of the stage's own deadline and the
 *   schedule's end, so an event is finished the day after its last occurrence
 *   rather than waiting up to a cadence for its next reminder.
 * - **`finished`** — the retention deadline, after which it's trashed.
 *
 * The schedule end is *computed* via `lastOccurrenceEnd` rather than read off
 * the stored `schedule.lastDate` column, for the reason `shouldFinish`
 * documents: a collection `beforeChange` hook runs before the field hook that
 * writes that column, and an un-backfilled NULL would read as "never ends".
 */
export function resolveNextCheckAt(input: NextCheckAtInput): string | null {
  const { stage, stageDeadline, schedule, inactive } = input

  // Dormant events have no schedule to run out — nothing schedule-driven can
  // happen to them, so only a stage deadline can bring them back.
  const scheduleEnd = inactive ? null : scheduleEndDate(schedule)

  if (isUnmanagedStage(stage)) return scheduleEnd?.toISOString() ?? null

  if (stage === 'finished') {
    return scheduleEnd ? addMonths(scheduleEnd, FINISHED_RETENTION_MONTHS).toISOString() : null
  }

  const deadlines = [stageDeadline, scheduleEnd].filter((date): date is Date => date != null)
  if (deadlines.length === 0) return null
  return new Date(Math.min(...deadlines.map((date) => date.getTime()))).toISOString()
}

/** End of the schedule's final occurrence, or null when it never ends. */
function scheduleEndDate(schedule: EventScheduleInput | null | undefined): Date | null {
  if (!schedule?.firstDate) return null
  const lastDate = lastOccurrenceEnd(schedule)
  return lastDate == null ? null : new Date(lastDate)
}
