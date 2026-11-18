import type { Where } from 'payload'

import { notFinishedWhere } from '@/collections/Events/lifecycle/finished'

/**
 * ⚠ **Published, even for a live-preview request.** A preview token lifts the
 * published-only access clause, and that put every unpublished draft on every
 * previewed map. The previewed document never needs the feed: the widget
 * renders it from its own `draft=true` read.
 */
const PUBLISHED: Where = { _status: { equals: 'published' } }

/**
 * ⚠ **Placed in a region.** The Atlas widget parses every feature's `region` as
 * an object, so one null fails the whole feed (SAHAJATLAS-WEB-2). Publishing
 * enforces `required`, but deleting a region nulls the column on its events
 * (`ON DELETE SET NULL`).
 */
const PLACED_IN_REGION: Where = { region: { exists: true } }

/**
 * Which classes the Atlas map draws.
 *
 * Two surfaces ask different questions of this one predicate, and a copy that
 * drifted would answer them differently: `GET /api/events/geojson` returns the
 * classes, and the Clients preview panel only asks whether any exist before it
 * tells a manager their region is empty. A clause in one and not the other is
 * that notice over a map with a pin on it.
 *
 * The sitemap is deliberately not a third caller: a crawler's reach is settled
 * by the client's own published-only access, and it lists a region's routes
 * rather than what is drawn.
 */
export function drawnOnMapWhere(now: Date): Where {
  return { and: [notFinishedWhere(now), PUBLISHED, PLACED_IN_REGION] }
}
