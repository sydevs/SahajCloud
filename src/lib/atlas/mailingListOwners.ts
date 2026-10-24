import type { PayloadRequest } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

import { resolveOwnersByRegion } from './regionOwners'
import { getRegionTree } from './regionTree'

/**
 * Which client's mailing list a class's registrants join (sydevs/SahajCloud#1022).
 *
 * The nearest region up the class's chain whose client (`clients.region`) has a
 * list switched on, then the `sy-atlas-config.canonicalFallbackClient` (We
 * Meditate) if its list is on, then nobody. Registration opt-ins follow the
 * class, not the site that embedded the widget: the same class is embedded on
 * several hosts, and its registrants belong to the people who run it.
 *
 * ⚠ **Not canonical ownership.** A client owns a canonical URL only once its
 * embed verifies (`regionOwners.ts`); a mailing list needs no embed at all, so
 * a client with a list and no verified host still owns its region's opt-ins.
 *
 * The Events `offersMailingList` field and `deliverSubscribe` both answer from
 * {@link mailingListClientFor}, so the box a registrant ticks and the list the
 * job pushes to cannot disagree.
 */

/** `req.context` key for the per-request memo. */
const MEMO_KEY = 'atlas:mailingListOwners'

/** A client whose list may receive opt-ins. A draft client has not been signed off. */
const LIST_ELIGIBLE = [
  { 'mailingList.enabled': { equals: true } },
  { _status: { equals: 'published' } },
] as const

interface MailingListOwners {
  byRegion: Map<number, number>
  fallback: number | null
}

/**
 * Region id → the client with a list that claims it.
 *
 * Read without `req`: the Events field resolves on the response of a create,
 * and a nested read joining that transaction can roll the write back
 * (`src/collections/AGENTS.md`).
 */
async function loadDirectListOwners(req: PayloadRequest): Promise<Map<number, number>> {
  const { docs } = await req.payload.find({
    collection: 'clients',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    where: { and: [...LIST_ELIGIBLE, { region: { exists: true } }] },
    select: { region: true },
  })

  const owners = new Map<number, number>()
  // Ascending id, so two clients claiming one region resolve the same way on
  // every request.
  for (const row of docs.slice().sort((a, b) => a.id - b.id)) {
    const regionId = relationId(row.region)
    if (regionId != null && !owners.has(regionId)) owners.set(regionId, row.id)
  }
  return owners
}

async function loadFallbackListClient(req: PayloadRequest): Promise<number | null> {
  const config = await req.payload.findGlobal({
    slug: 'sy-atlas-config',
    depth: 0,
    overrideAccess: true,
  })
  const clientId = relationId(config.canonicalFallbackClient)
  if (clientId == null) return null

  const { docs } = await req.payload.find({
    collection: 'clients',
    where: { and: [{ id: { equals: clientId } }, ...LIST_ELIGIBLE] },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { region: true },
  })
  return docs[0]?.id ?? null
}

async function loadMailingListOwners(req: PayloadRequest): Promise<MailingListOwners> {
  const [{ chainById }, direct, fallback] = await Promise.all([
    getRegionTree(req),
    loadDirectListOwners(req),
    loadFallbackListClient(req),
  ])
  return { byRegion: resolveOwnersByRegion(chainById, direct), fallback }
}

/** The client whose list a class in `regionId` sends opt-ins to, or `null` when none applies. */
export async function mailingListClientFor(
  req: PayloadRequest,
  regionId: number | null,
): Promise<number | null> {
  const owners = await memoizeOnRequest(req, MEMO_KEY, () => loadMailingListOwners(req))
  return (regionId == null ? undefined : owners.byRegion.get(regionId)) ?? owners.fallback
}
