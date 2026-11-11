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
 * `data` is the whole merged document here, not the caller's patch, so
 * `owned: true` arrives with every write of an owner. Only a claim — a new
 * owner, or the flag turning on — runs the incumbent query; every other write,
 * the Install tab's saves and the report endpoint's included, skips it.
 *
 * ⚠ **An inactive owner is no incumbent**, as it owns nothing by the read rule
 * (`CANONICAL_ELIGIBLE`): counting it would lock its region until an admin
 * noticed.
 */
export const validateCanonicalOwnership: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) return data
  const before = originalDoc as Partial<Client> | undefined
  const region = relationId(data.region)
  const wasOwned = Boolean(before?.canonical?.owned)

  // A move always releases; re-claiming the new region is the next Check's job.
  if (before && wasOwned && region !== relationId(before.region)) {
    data.canonical = { ...data.canonical, owned: false }
    return data
  }

  // An inactive owner is no incumbent, so another site may have taken the region
  // meanwhile: coming back releases it, as a move does, rather than making two.
  const reactivated = before && wasOwned && before.enabled !== true && data.enabled === true
  if (!data.canonical?.owned || (wasOwned && !reactivated)) return data

  if (region == null) {
    if (reactivated) return data
    const fallbackId = await getCanonicalFallbackClientId(req)
    if (before?.id != null && fallbackId === before.id) return data
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
        { enabled: { equals: true } },
        { region: { equals: region } },
        ...(before?.id ? [{ id: { not_equals: before.id } }] : []),
      ],
    },
    limit: 1,
    depth: 0,
    select: { label: true },
    overrideAccess: true,
    req,
  })

  if (incumbents.length > 0 && reactivated) {
    data.canonical = { ...data.canonical, owned: false }
    return data
  }

  if (incumbents.length > 0) {
    throw new ValidationError({
      collection: 'clients',
      errors: [
        {
          path: 'canonical.owned',
          message:
            `"${incumbents[0].label}" is already the home for this region’s atlas links. ` +
            'Release it there first, or pick a different region.',
        },
      ],
    })
  }

  return data
}
