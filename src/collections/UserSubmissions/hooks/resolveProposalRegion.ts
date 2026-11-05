import type { CollectionBeforeValidateHook } from 'payload'

import { isManualMapboxId } from '@/lib/mapbox/manualLocation'
import type { Region, SubmissionLocation } from '@/payload-types'

/**
 * beforeValidate (create): place a new-event proposal on the region tree from
 * its Mapbox ids (#1021) — the address's own (`proposed.address.mapboxId`, which
 * can match a venue) and the layers in `location` — matched against
 * `regions.mapboxId`.
 *
 * Only a venue or city becomes `region`, because an event must sit in one.
 * `routingRegion` takes the deepest match at whatever level, so delivery and a
 * region manager's own read still reach the manager above a city the atlas
 * does not have yet. A correction keeps its target's region. Every output
 * carries `systemFieldAccess`, which strips a client's own value before this
 * runs.
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
  const address = (data.proposed as { address?: { mapboxId?: unknown } } | undefined)?.address
  // A hand-entered region's `manual-…` id names no real place to match.
  const ids = [address?.mapboxId, location.placeId, location.regionId, location.countryId].filter(
    (id): id is string => typeof id === 'string' && id !== '' && !isManualMapboxId(id),
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
  // Nothing on the atlas: leave whatever a trusted writer passed alone.
  if (docs.length === 0) return data
  const first = (level: Region['level']) => docs.find((region) => region.level === level)?.id

  const anchorRegion = first('venue') ?? first('city')
  // Deepest first: a venue or city beats the state above it, which beats the
  // country. One column, so the access clause and `deliverProposal` read an
  // answer rather than walking a chain.
  const routingRegion = anchorRegion ?? first('region') ?? first('country') ?? null
  return {
    ...data,
    region: anchorRegion ?? data.region,
    routingRegion: routingRegion ?? data.routingRegion,
  }
}
