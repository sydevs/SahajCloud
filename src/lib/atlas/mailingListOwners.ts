import type { PayloadRequest } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

import { getCanonicalFallbackClientId, resolveOwnersByRegion } from './regionOwners'
import { getRegionTree } from './regionTree'

/**
 * Which client's mailing list a class's registrants join (#1022): the nearest
 * region up the class's chain whose client (`clients.region`) has a list, else
 * the `sy-atlas-config` fallback client's (We Meditate), else none.
 *
 * Opt-ins follow the class, not the site that embedded the widget: one class
 * is embedded on several hosts, and its registrants belong to whoever runs it.
 * The Events `offersMailingList` field and `deliverSubscribe` both answer from
 * {@link mailingListClientFor}, so the box a registrant ticks and the list the
 * job pushes to cannot disagree.
 *
 * ⚠ **Not canonical ownership.** A client owns a canonical URL only once its
 * embed verifies (`regionOwners.ts`); a mailing list needs no embed, so a client
 * with a list and no verified host still owns its region's opt-ins.
 */

const OWNERS_MEMO_KEY = 'atlas:mailingListOwners'
const FALLBACK_MEMO_KEY = 'atlas:mailingListFallback'

/**
 * A client whose list can take an address: the same four fields
 * `isMailingListConfigured` demands at delivery, so a half-filled list is never
 * offered and never hides a complete one further up. A draft client has not
 * been signed off.
 */
const LIST_ELIGIBLE = [
  { 'mailingList.enabled': { equals: true } },
  { 'mailingList.provider': { exists: true } },
  { 'mailingList.listId': { exists: true } },
  { 'mailingList.apiKey': { exists: true } },
  { _status: { equals: 'published' } },
] as const

/**
 * Region id → the client with a list that claims it. Ascending id, so two
 * clients claiming one region resolve the same way on every request.
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
    sort: 'id',
    where: { and: [...LIST_ELIGIBLE, { region: { exists: true } }] },
    select: { region: true },
  })

  const owners = new Map<number, number>()
  for (const row of docs) {
    const regionId = relationId(row.region)
    if (regionId != null && !owners.has(regionId)) owners.set(regionId, row.id)
  }
  return owners
}

async function loadMailingListOwners(req: PayloadRequest): Promise<Map<number, number>> {
  const [{ chainById }, direct] = await Promise.all([getRegionTree(req), loadDirectListOwners(req)])
  return resolveOwnersByRegion(chainById, direct)
}

async function loadFallbackListClient(req: PayloadRequest): Promise<number | null> {
  const clientId = await getCanonicalFallbackClientId(req)
  if (clientId == null) return null

  const { docs } = await req.payload.find({
    collection: 'clients',
    where: { and: [{ id: { equals: clientId } }, ...LIST_ELIGIBLE] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return docs[0]?.id ?? null
}

/** The client whose list a class in `regionId` sends opt-ins to, or `null` when none applies. */
export async function mailingListClientFor(
  req: PayloadRequest,
  regionId: number | null,
): Promise<number | null> {
  const owners = await memoizeOnRequest(req, OWNERS_MEMO_KEY, () => loadMailingListOwners(req))
  const owner = regionId == null ? undefined : owners.get(regionId)
  // Asked only on a miss: an owned region never pays for the fallback's reads.
  return owner ?? memoizeOnRequest(req, FALLBACK_MEMO_KEY, () => loadFallbackListClient(req))
}
