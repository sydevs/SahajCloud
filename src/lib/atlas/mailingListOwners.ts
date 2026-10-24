import type { PayloadRequest } from 'payload'

import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

import {
  getCanonicalFallbackClientId,
  loadRegionClaims,
  resolveOwnersByRegion,
} from './regionOwners'
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
 * A client whose list can take an address: the same non-blank fields
 * `isMailingListConfigured` demands at delivery, so a half-filled list is never
 * offered and never hides a complete one further up. A draft client has not
 * been signed off.
 */
const LIST_ELIGIBLE = [
  { 'mailingList.enabled': { equals: true } },
  { 'mailingList.provider': { exists: true } },
  { 'mailingList.listId': { exists: true } },
  { 'mailingList.listId': { not_equals: '' } },
  { 'mailingList.apiKey': { exists: true } },
  { 'mailingList.apiKey': { not_equals: '' } },
  { _status: { equals: 'published' } },
] as const

async function loadMailingListOwners(req: PayloadRequest): Promise<Map<number, number>> {
  const [{ chainById }, direct] = await Promise.all([
    getRegionTree(req),
    loadRegionClaims(req, LIST_ELIGIBLE, (row) => row.id),
  ])
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
