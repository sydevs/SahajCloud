import type { CollectionBeforeValidateHook } from 'payload'

import type { Region, SubmissionLocation } from '@/payload-types'

/** Most specific first: the event is created in the deepest match. */
const LEVEL_RANK: Record<Region['level'], number> = { venue: 0, city: 1, region: 2, country: 3 }

/**
 * beforeValidate (create): place a new-event proposal on the region tree from
 * the `location` the visitor picked (#1021).
 *
 * Matches each Mapbox id against `regions.mapboxId` — the id-space the admin
 * picker and the widget's geocoder share — and writes what it found:
 *
 * - `region` and `regionHint.anchorRegion` — the matched venue or city, which
 *   Accept creates the event in. Left empty when only a state or country
 *   matched: an event must sit in a city or venue, and the reviewer sets one.
 * - `regionHint.state` / `regionHint.country` — so `deliverProposal` can still
 *   reach the nearest manager above a city the atlas does not have yet.
 *
 * A correction (`event` set) keeps its target's region, so it is skipped. Both
 * outputs carry `systemFieldAccess`, which strips a client's own value in the
 * field pass before this runs — so whatever reaches the row came from here.
 *
 * Read without `req`: regions are committed state, and a nested read joining
 * the create's transaction can take the create down with it.
 */
export const resolveProposalRegion: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create' || !data || data.type !== 'proposal' || data.event != null) {
    return data
  }

  const location = (data.location ?? {}) as SubmissionLocation
  const ids = [location.mapboxId, location.placeId, location.regionId, location.countryId].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  )
  if (ids.length === 0) return data

  const { docs } = await req.payload.find({
    collection: 'regions',
    where: { mapboxId: { in: ids } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { level: true },
  })
  const matched = (docs as Pick<Region, 'id' | 'level'>[])
    .slice()
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.id - b.id)

  const first = (levels: Region['level'][]) => matched.find((r) => levels.includes(r.level))?.id
  const anchorRegion = first(['venue', 'city'])
  const state = first(['region'])
  const country = first(['country'])

  return {
    ...data,
    ...(anchorRegion != null ? { region: anchorRegion } : {}),
    regionHint: {
      ...(country != null ? { country } : {}),
      ...(state != null ? { state } : {}),
      ...(anchorRegion != null ? { anchorRegion } : {}),
    },
  }
}
