import type { Where } from 'payload'

/**
 * The `where` form of "this event has not finished" — the filter that keeps
 * finished events out of the public feeds (`GET /api/events/geojson` and, for
 * API clients, `GET /api/events`).
 *
 * A finished event stays **published** (#603): its Atlas page must keep
 * resolving so a late seeker following an old link lands somewhere, and
 * `webPath` / `webUrl` are publish-gated. Nothing unpublishes it any more, so
 * this predicate is the only thing keeping it off the map and out of listings.
 *
 * The SQL counterpart of `shouldFinish` in `@/lib/schedule/scheduleStatus` —
 * same three rules, expressed against the stored `schedule.lastDate` column
 * because a `where` can't call a function:
 *
 * - `inactive` events are never finished (dormant by design, no schedule).
 * - A NULL `lastDate` means the recurrence never ends — or the row predates the
 *   backfill. Both must stay visible, so NULL passes.
 * - Otherwise the final occurrence's local day must not be behind us.
 *
 * `tests/unit/schedule-status.spec.ts` pins the two to the same answers.
 */
export function notFinishedWhere(now: Date): Where {
  return {
    or: [
      { inactive: { equals: true } },
      { 'schedule.lastDate': { exists: false } },
      { 'schedule.lastDate': { greater_than_equal: now.toISOString() } },
    ],
  }
}

/** AND a filter onto a caller's `where`, dropping an absent/empty one. */
export function andWhere(caller: Where | undefined, filter: Where): Where {
  return caller && Object.keys(caller).length > 0 ? { and: [caller, filter] } : filter
}
