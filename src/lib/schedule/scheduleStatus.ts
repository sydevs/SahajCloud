/**
 * Schedule-derived event status — the single definition of "this event has
 * finished", shared by the ExpireEvents job (which marks it `finished`), the
 * registration endpoint (which refuses to register for it), and the public
 * event feeds (which drop it — see `notFinishedWhere` in
 * `@/collections/Events/lifecycle/finished`).
 *
 * "Finished" means the schedule has fully run out: the stored
 * `schedule.lastDate` — end of the final occurrence's local day, see
 * `lastOccurrenceEnd` — is in the past. A `null` `lastDate` means the
 * recurrence never ends, so it never finishes.
 *
 * `inactive` events are exempt: they're dormant by design and carry no
 * schedule, so without the guard every one of them would falsely "finish".
 */

import type { EventSchedule } from '@/types/schedule'

import { lastOccurrenceEnd } from './scheduleHooks'

/** Minimal shape the finished-check reads off an event. */
export interface FinishCheckInput {
  inactive?: boolean | null
  schedule?: Partial<EventSchedule> | null
}

/**
 * Whether an event's schedule has run out (Atlas `should_finish?`).
 *
 * Computed from the schedule sub-fields via `lastOccurrenceEnd` rather than read
 * off the stored `schedule.lastDate` column. The column is that function's
 * projection, so the two agree — but computing means the nightly sweep is
 * correct from the moment this ships, with no dependency on the backfill having
 * run (an un-backfilled NULL column would otherwise read as "never ends" and the
 * event would never finish).
 *
 * The SQL counterpart is `notFinishedWhere`, which *must* use the column;
 * `tests/unit/schedule-status.spec.ts` pins the two to the same answers.
 */
export function shouldFinish(event: FinishCheckInput, now: Date = new Date()): boolean {
  if (event.inactive) return false
  const schedule = event.schedule
  if (!schedule?.firstDate) return false
  const lastDate = lastOccurrenceEnd(schedule)
  return lastDate != null && new Date(lastDate) < now
}
