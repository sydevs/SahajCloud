import type { CollectionBeforeValidateHook } from 'payload'

import { isManualMapboxId } from '@/lib/mapbox/manualLocation'
import type { Region, SubmissionLocation, SubmissionRegionHint } from '@/payload-types'

/**
 * beforeValidate (create): place a new-event proposal on the region tree from
 * the Mapbox ids in its `location` (#1021), matched against `regions.mapboxId`.
 *
 * Only a venue or city becomes `region`, because an event must sit in one; a
 * state or country match is kept in `regionHint` so delivery can still reach
 * the manager above a city the atlas does not have yet. A correction keeps its
 * target's region. Both outputs carry `systemFieldAccess`, which strips a
 * client's own value before this runs.
 *
 * Read without `req`: a nested read joining the create's transaction can take
 * the create down with it.
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
  // A hand-entered region's `manual-…` id names no real place to match.
  const ids = [location.mapboxId, location.placeId, location.regionId, location.countryId].filter(
    (id): id is string => Boolean(id) && !isManualMapboxId(id),
  )
  if (ids.length === 0) return data

  const { docs } = await req.payload.find({
    collection: 'regions',
    where: { mapboxId: { in: ids } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    sort: 'id',
    select: { level: true },
  })
  const first = (level: Region['level']) => docs.find((region) => region.level === level)?.id

  const anchorRegion = first('venue') ?? first('city')
  const regionHint: SubmissionRegionHint = {
    country: first('country'),
    state: first('region'),
    anchorRegion,
  }
  return { ...data, region: anchorRegion ?? data.region, regionHint }
}
