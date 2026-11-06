import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import { getCanonicalFallbackClientId } from '@/lib/atlas/regionOwners'
import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

/**
 * Enforce the rule that makes "who owns this region's atlas links?" answerable
 * at all (#633).
 *
 * `client.region` alone cannot identify an owner — several services map to one
 * country. Ownership is therefore a flag (`canonical.owned`), set by the Install
 * tab's claim, plus a uniqueness rule:
 *
 * - at most one owning service per region, rejected with the incumbent's name
 *   so whoever hit the error knows who to talk to;
 * - a Worldwide service (no region) owns nothing, except the one
 *   `sy-atlas-config` names as the fallback, which owns every region no other
 *   service does;
 * - **ownership does not follow a region change.** An admin moving a service to
 *   another region clears the flag, and the next check claims the new region if
 *   it is free — the old region's links must not silently move with it.
 *
 * Runs only when the write actually touches `canonical` or `region`. Everything
 * else — the Install tab's own saves, and `POST /api/clients/report`'s
 * `embedMetadata` write — skips the incumbent query entirely.
 */
export const validateCanonicalOwnership: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (data?.canonical === undefined && data?.region === undefined) return data

  const previous = (originalDoc ?? {}) as Partial<Client>
  const stored = previous.canonical ?? {}
  const patch = data.canonical ?? {}
  const region = relationId(data.region === undefined ? previous.region : data.region)
  const regionMoved =
    Boolean(originalDoc) && data.region !== undefined && region !== relationId(previous.region)

  // `data` is the whole merged document here, not the caller's patch, so
  // `owned: true` arrives with every write of an owner. A move always releases;
  // re-claiming the new region is the next Check's job.
  if (regionMoved && stored.owned) {
    data.canonical = { ...stored, ...patch, owned: false }
    return data
  }

  const owned = 'owned' in patch ? patch.owned : stored.owned
  if (!owned) return data

  const moved = !originalDoc || ('owned' in patch && patch.owned !== stored.owned) || regionMoved
  if (!moved) return data

  if (region == null) {
    const fallbackId = await getCanonicalFallbackClientId(req)
    if (originalDoc?.id != null && fallbackId === originalDoc.id) return data
    throw new ValidationError({
      collection: 'clients',
      errors: [
        {
          path: 'canonical.owned',
          message:
            'A worldwide service owns no region’s atlas links. Set a region first, or name this service as the fallback on the Atlas config.',
        },
      ],
    })
  }

  const { docs: incumbents } = await req.payload.find({
    collection: 'clients',
    where: {
      and: [
        { 'canonical.owned': { equals: true } },
        { region: { equals: region } },
        ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
      ],
    },
    limit: 1,
    depth: 0,
    select: { name: true },
    overrideAccess: true,
    req,
  })

  if (incumbents.length > 0) {
    throw new ValidationError({
      collection: 'clients',
      errors: [
        {
          path: 'canonical.owned',
          message:
            `"${incumbents[0].name}" is already the home for this region’s atlas links. ` +
            'Release it there first, or pick a different region.',
        },
      ],
    })
  }

  return data
}
