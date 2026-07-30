import type { CollectionBeforeOperationHook, Where } from 'payload'

import { isTrustedReq } from '@/plugins/usage/hooks'

import { andWhere, notFinishedWhere } from '../lifecycle/finished'

/**
 * beforeOperation hook: keep finished events out of an API client's **list**
 * reads by default.
 *
 * Finished events stay published (#603) so their Atlas pages keep resolving, so
 * this filter is the only thing keeping them out of `GET /api/events`. Sibling of
 * the geojson feed's unconditional filter — same predicate, one difference: here
 * there *is* an opt-out, because a client asking for past events deliberately
 * should get them.
 *
 * Applies only when:
 *
 * - the operation is a list read. Payload maps both `find` and `findByID` to the
 *   `read` hook operation, so they're told apart by `findByID`'s `id` arg (same
 *   trick as `filterMeditationsByLocale`). `findByID` is deliberately untouched:
 *   `GET /api/events/{id}` still resolves a finished event, which is the whole
 *   point of keeping it published;
 * - the caller is an API client (`req.user.collection === 'clients'`, cf.
 *   `requireActiveClient`) serving its own query — admin, the Atlas manager
 *   sidebar, job reads, and an endpoint's internal `asTrustedReq` lookups are all
 *   unaffected, since those legitimately need to see finished events (the sidebar
 *   buckets key off `verificationStage`);
 * - the incoming `where` doesn't already mention `schedule.lastDate` — that's
 *   the explicit opt-out. A client querying past events gets what it asked for.
 *
 * The geojson feed's read passes through here too, and its own filter trips the
 * opt-out above — so the predicate is applied once, by the endpoint. That's the
 * stricter of the two: the endpoint ANDs unconditionally, so a caller's `where`
 * can't bring finished events back into the map feed the way it can here.
 */
export const excludeFinishedEvents: CollectionBeforeOperationHook = ({ operation, args }) => {
  if (operation !== 'read' && operation !== 'count') return args
  // `findByID` arrives as `read` too, but carries an `id` — leave it alone.
  if ('id' in args) return args
  if (args.req?.user?.collection !== 'clients') return args
  // An endpoint's own forwarded lookup (asTrustedReq) must see the true state so
  // it can answer precisely — `POST /api/events/{id}/register` needs to tell "no
  // such event" (404) from "this event has ended" (409).
  if (isTrustedReq(args.req)) return args

  const where = args.where as Where | undefined
  if (referencesLastDate(where)) return args

  args.where = andWhere(where, notFinishedWhere(new Date()))
  return args
}

/** The `schedule.lastDate` path a caller can name to opt out of the filter. */
const LAST_DATE_PATH = 'schedule.lastDate'

/**
 * Whether a `where` tree mentions `schedule.lastDate` anywhere, recursing through
 * `and` / `or` so a reference inside a compound filter still counts.
 *
 * Only the dotted path is checked, because it's the only form that reaches here:
 * Payload's query validation rejects the nested-group shape
 * (`where[schedule][lastDate][…]`) with "path cannot be queried" before the read
 * runs, so `where[schedule.lastDate][…]` is the sole way to name the column.
 */
function referencesLastDate(where: Where | undefined): boolean {
  if (!where || typeof where !== 'object') return false

  for (const [key, value] of Object.entries(where)) {
    if (key === LAST_DATE_PATH) return true
    if ((key === 'and' || key === 'or') && Array.isArray(value)) {
      if (value.some((clause) => referencesLastDate(clause as Where))) return true
    }
  }

  return false
}
