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
import type { EventSchedule } from '@/types/schedule'

import { isPreAdoptionStage, STAGES, type VerificationStage } from './stages'

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

/**
 * When a `finished` event reached from `from` is trashed.
 *
 * Exported for the save hook: restoring an event from the trash has to run its
 * retention from the restore, not from the schedule's end — that one is already
 * behind us, which is why the event was trashed in the first place (#1116).
 */
export function retentionFrom(from: Date): string {
  return addMonths(from, FINISHED_RETENTION_MONTHS).toISOString()
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
  schedule?: Partial<EventSchedule> | null
  inactive?: boolean | null
  /** The event's publish state, which decides whether reminders run at all. */
  status?: string | null
  /** Injected clock — the `finished` retention fallback needs a reference point. */
  now?: Date
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
 * The four rules:
 *
 * - **Pre-adoption** (`unverified` / `denied`) — no manager, so no cadence;
 *   the only thing that can happen is the schedule running out.
 * - **`finished`** — the retention deadline, after which it's trashed.
 * - **A draft on a reminder stage** — nothing. A manager who hides a class is
 *   not letting it rot: the reminder ladder exists to ask whether a *listed*
 *   class is still running, and chasing someone about a class nobody can see
 *   is noise that ends in unpublishing what is already unpublished (#1120
 *   decision 3). Republishing re-verifies through the save hook, which restarts
 *   the cycle. `expired` is not a reminder stage and keeps its trash
 *   countdown — being unpublished is that stage's own doing.
 * - **Ladder stages** — the earlier of the stage's own deadline and the
 *   schedule's end, so an event is finished the day after its last occurrence
 *   rather than waiting up to a cadence for its next reminder.
 *
 * ## When this returns `null`, and why that's the whole point
 *
 * `null` means "no scheduled transition exists" — not "unknown". It's the
 * mechanism that keeps the sweep cheap, so it can't be designed away: making
 * the column non-nullable would mean inventing a fake deadline for every
 * dormant listing and waking each one up forever to do nothing, which is the
 * cost the watermark exists to avoid.
 *
 * What *can* be guaranteed, and is:
 *
 * - **Every managed stage** (`verified` → `expired`) always has a deadline —
 *   its own cadence — so it is never null.
 * - **`finished`** is never null either: retention runs from the schedule's end
 *   when there is one, and otherwise from `now` (an event can reach `finished`
 *   with no computable schedule end — the Atlas importer maps a dump status
 *   straight to the stage, dormant or open-ended recurrence included. Without
 *   this fallback those rows would keep a null watermark and never be trashed).
 *
 * So the contract narrows to two cases: **a pre-adoption stage with no schedule
 * end** (dormant, or an open-ended recurrence), and **a draft on a reminder
 * stage**. Both genuinely have nothing scheduled — adoption and republishing
 * are editor actions, not dates. `tests/unit/next-check-at.spec.ts` pins that
 * as an invariant over every stage.
 *
 * The schedule end is *computed* via `lastOccurrenceEnd` rather than read off
 * the stored `schedule.lastDate` column, for the reason `shouldFinish`
 * documents: a collection `beforeChange` hook runs before the field hook that
 * writes that column, and an un-backfilled NULL would read as "never ends".
 */
export function resolveNextCheckAt(input: NextCheckAtInput): string | null {
  const { stage, stageDeadline, schedule, inactive, status, now = new Date() } = input

  // Dormant events have no schedule to run out — nothing schedule-driven can
  // happen to them, so only a stage deadline can bring them back.
  const scheduleEnd = inactive ? null : scheduleEndDate(schedule)

  if (isPreAdoptionStage(stage)) return scheduleEnd?.toISOString() ?? null

  // Retention runs from the schedule's end where there is one, else from the
  // moment it finished — so a finished event always has a date to be trashed on.
  if (stage === 'finished') return retentionFrom(scheduleEnd ?? now)

  // A hidden class is nobody's to chase. Only the reminder ladder is silenced:
  // `expired` is unpublished by the ladder itself, and its trash countdown is
  // what finally clears it.
  if (status === 'draft' && STAGES[stage]?.onDue.kind === 'remind') return null

  const deadlines = [stageDeadline, scheduleEnd].filter((date): date is Date => date != null)
  if (deadlines.length === 0) return null
  return new Date(Math.min(...deadlines.map((date) => date.getTime()))).toISOString()
}

/** End of the schedule's final occurrence, or null when it never ends. */
function scheduleEndDate(schedule: Partial<EventSchedule> | null | undefined): Date | null {
  if (!schedule?.firstDate) return null
  const lastDate = lastOccurrenceEnd(schedule)
  return lastDate == null ? null : new Date(lastDate)
}
