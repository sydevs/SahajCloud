/**
 * Schedule-derived event status — shared by the ExpireEvents job (which marks a
 * finished event `finished` + unpublished) and the registration endpoint's
 * gating (which rejects a registration for an event that has already ended).
 * Keeping one definition means "the schedule has run out" is decided the same
 * way in both places; see `src/collections/Events/endpoints/registerForEvent.ts`
 * and `src/jobs/ExpireEvents/ExpireEvents.ts`.
 */

/** Minimal shape the finished-check reads off an event. */
export interface FinishCheckInput {
  inactive?: boolean | null
  schedule?: { firstDate?: string | null; upcomingDates?: unknown } | null
}

/**
 * Whether an event's schedule has run out (Atlas `should_finish?`): it has a
 * schedule, is NOT inactive, and the schedule has no upcoming dates. The
 * `!inactive` + has-schedule guards are essential — without them every inactive
 * or scheduleless event would falsely "finish".
 *
 * `upcomingDates` is the schedule's virtual field (next occurrences from now),
 * so this reflects both a one-off whose date has passed and a course whose last
 * occurrence is behind us.
 */
export function shouldFinish(event: FinishCheckInput): boolean {
  if (event.inactive) return false
  const schedule = event.schedule
  if (!schedule?.firstDate) return false
  const upcoming = schedule.upcomingDates
  return Array.isArray(upcoming) && upcoming.length === 0
}
