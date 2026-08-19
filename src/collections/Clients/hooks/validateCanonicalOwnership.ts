import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import type { Client } from '@/payload-types'

/**
 * Enforce the rule that makes "who owns this region's canonical URLs?"
 * answerable at all (#633).
 *
 * `client.region` alone cannot identify an owner — three published clients map
 * to Czechia, two to Finland, two to Australia. Ownership therefore needs an
 * explicit opt-in (`canonical.enabled`) plus a uniqueness rule, not an
 * inference. When a client enables it:
 *
 * - `region` and `canonical.embed` are required — an enabled client with
 *   neither names no region and no host, so it could never resolve anything.
 * - at most one enabled client per region, rejected with the incumbent's name
 *   so whoever hit the error knows who to talk to.
 *
 * Runs only when the write actually touches `canonical` or `region`. Everything
 * else — including `POST /api/clients/report`'s `embedMetadata` write, which
 * runs on every mount change — skips the incumbent query entirely.
 */
export const validateCanonicalOwnership: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (data?.canonical === undefined && data?.region === undefined) return data

  // A collection `beforeChange` receives the incoming patch, not the merged
  // document, so the effective post-write state is the patch over the original.
  // Spread, not deep merge — an explicit `null` in the patch (a cleared embed)
  // must win over the stored value.
  const previous = (originalDoc ?? {}) as Partial<Client>
  const stored = previous.canonical ?? {}
  const patch = data.canonical ?? {}
  const canonical = { ...stored, ...patch }
  const region = relationId(data.region === undefined ? previous.region : data.region)

  if (!canonical.enabled) return data

  // Payload materialises an empty object for a group the patch omits, so the
  // guard above still lets an unrelated write through to here. Nothing the two
  // rules read has actually moved, and the stored state was validated when it
  // was set — so skip. This is not only the cheaper path: it stops an unrelated
  // edit being *refused* because someone left two services enabled on one region
  // or cleared a region by hand. (`originalDoc` is absent on create, so a new
  // document always validates.)
  const moved =
    !originalDoc ||
    ('enabled' in patch && patch.enabled !== stored.enabled) ||
    ('embed' in patch && patch.embed !== stored.embed) ||
    (data.region !== undefined && region !== relationId(previous.region))
  if (!moved) return data

  const missing: string[] = []
  if (region == null) missing.push('a region')
  if (!canonical.embed) missing.push('a canonical embed')

  if (missing.length > 0) {
    throw new ValidationError({
      collection: 'clients',
      errors: [
        {
          path: 'canonical.enabled',
          message: `Canonical ownership needs ${missing.join(' and ')}. Fill ${
            missing.length > 1 ? 'those in' : 'that in'
          } or leave canonical ownership off.`,
        },
      ],
    })
  }

  // Committed state only: a draft edit lives in `_clients_v` and doesn't show
  // up here, so a conflicting draft is caught on publish, when this hook runs
  // again with the values that are about to become real.
  //
  // Check-then-write, so two *simultaneous* enables on one region could both
  // pass. Not defended against, deliberately: this runs on an admin save — a
  // human ticking a checkbox — so the window is a few milliseconds of human-paced
  // traffic, and the result is a visible data state a later save reports rather
  // than silent corruption. The airtight fix is a partial unique index
  // (`WHERE canonical_enabled`), which Payload can't declare and which would
  // need a hand-written migration; if the resolver ticket comes to depend on
  // one-owner-per-region as an invariant rather than a rule, add it there.
  const { docs: incumbents } = await req.payload.find({
    collection: 'clients',
    where: {
      and: [
        { 'canonical.enabled': { equals: true } },
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
          path: 'canonical.enabled',
          message:
            `"${incumbents[0].name}" already owns the canonical URLs for this region. ` +
            'Turn canonical ownership off there first, or pick a different region.',
        },
      ],
    })
  }

  return data
}
