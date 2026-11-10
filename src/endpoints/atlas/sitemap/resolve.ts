import type { SitemapCandidate } from './sitemapUrls'
import type { AtlasSitemapUrl } from '../../responseTypes'
import type { PayloadRequest, SelectType } from 'payload'

import { andWhere, notFinishedWhere } from '@/collections/Events/lifecycle/finished'
import { getCanonicalFallbackOwner, getRegionOwners } from '@/lib/atlas/regionOwners'
import { getRegionTree } from '@/lib/atlas/regionTree'
import { asTrustedReq } from '@/plugins/usage/hooks'

import { fallbackRegionIds, ownedRegionIds, sitemapUrls } from './sitemapUrls'

/**
 * Which atlas URLs one client owns — the one resolution `GET /api/atlas/sitemap`
 * and `GET /api/atlas/wix/sitemap` (#1055) both serialize. A second
 * implementation of the URL rule is free to disagree, and a sitemap that
 * disagrees is a set of 404s submitted to a crawler (#650).
 */

/**
 * The fields one sitemap row is built from. `webPath` / `webUrl` are the same
 * virtual fields `GET /api/atlas/seo` reads its `route` / `canonical` from —
 * reading them here, rather than composing a URL from the owner's domain, is
 * what makes the two byte-identical by construction.
 *
 * A region's pair derives from the document id alone, so nothing extra has to be
 * co-selected. An event's derives from `region` and `_status`, which the fields'
 * own declarations add back — `region` is named explicitly anyway, matching the
 * seo endpoint's selects.
 */
const REGION_SELECT: SelectType = {
  webPath: true,
  webUrl: true,
  updatedAt: true,
  // For Wix's `WixRouterSitemapEntry` (#1055): one more column, never a second query.
  name: true,
}
const EVENT_SELECT: SelectType = {
  webPath: true,
  webUrl: true,
  updatedAt: true,
  region: true,
  title: true,
}

/**
 * Every publishable document in the given regions: the regions themselves, and
 * the classes attached to them.
 *
 * Both reads are unpaginated. The corpus is ~595 regions and ~653 events in
 * total and a client owns a subtree of it, so a page boundary would be a limit
 * invented for its own sake — and a truncated sitemap is worse than a slow one,
 * because nothing in the response would say it had been cut. If it ever needs
 * bounding, a cursor is easier to add than to remove.
 *
 * Both forward the caller's `req` with `overrideAccess: false`, so the client's
 * own access rules still apply — published-only. They forward it **trusted**,
 * because the corpus bound above is this endpoint's judgement rather than the
 * caller's (#889).
 *
 * ⚠ **That bypass is why the events read ANDs `notFinishedWhere` itself.**
 * `excludeFinishedEvents` stands down for a trusted req, so leaving the filter
 * to the hook would publish finished classes. A finished class stays reachable
 * by direct link, but a sitemap is a list of pages we are asking a crawler to
 * index, and a class that no longer happens is not one of them.
 *
 * ⚠ **The `regions` read is not redundant with the region tree**, though it
 * looks it: resolving ownership has already loaded every region's `pathById`,
 * so a future optimization is bound to notice that the paths are in memory and
 * try to build `loc` as `canonicalUrlBase(owner) + path`. That would make this
 * endpoint the *second* implementation of the URL rule — the exact thing #650
 * exists to prevent — and the byte-identity case in
 * `tests/int/atlas-sitemap.int.spec.ts` is what would catch it. Reading the
 * document's own `webUrl` is the point, and it is also where `updatedAt` (the
 * `lastmod` a consumer cannot derive) comes from.
 */
async function ownedDocuments(
  req: PayloadRequest,
  regionIds: number[],
): Promise<SitemapCandidate[]> {
  const trustedReq = asTrustedReq(req)
  const [regions, events] = await Promise.all([
    req.payload.find({
      collection: 'regions',
      where: { id: { in: regionIds } },
      pagination: false,
      depth: 0,
      select: REGION_SELECT,
      overrideAccess: false,
      req: trustedReq,
    }),
    req.payload.find({
      collection: 'events',
      where: andWhere({ region: { in: regionIds } }, notFinishedWhere(new Date())),
      pagination: false,
      depth: 0,
      select: EVENT_SELECT,
      overrideAccess: false,
      req: trustedReq,
    }),
  ])
  return [...(regions.docs as SitemapCandidate[]), ...(events.docs as SitemapCandidate[])]
}

export interface AtlasSitemapResolution {
  urls: AtlasSitemapUrl[]
  /**
   * Each route's display name. Not a key on `AtlasSitemapUrl`, which client
   * repos sync by raw GitHub URL — a fourth key there changes three repos' contract.
   */
  titleByRoute: Map<string, string>
}

/**
 * Every atlas URL `clientId` owns, ascending by route.
 *
 * Ownership is per-subtree with the **nearest** declaring ancestor winning, and
 * one client may additionally be the canonical *fallback* (#652), whose answer
 * is the complement of the ownership map. Both rules live in `./sitemapUrls`;
 * this is the read around them.
 */
export async function resolveAtlasSitemap(args: {
  req: PayloadRequest
  clientId: number
}): Promise<AtlasSitemapResolution> {
  const { req, clientId } = args

  // Two memoized reads; the fallback lookup is the one `sy-atlas-config`
  // read #652 adds.
  const [ownerById, fallbackOwner] = await Promise.all([
    getRegionOwners(req),
    getCanonicalFallbackOwner(req),
  ])

  // The one branch. For the fallback client the answer is the *complement*
  // of the ownership map plus whatever it declares itself; for everyone
  // else it is the lookup it always was. The region tree is read inside
  // that branch because only it takes a complement — every other client,
  // including the `{ urls: [] }` case, would pay a `regions` query to
  // compute a set it never looks at.
  const regionIds =
    fallbackOwner?.clientId === clientId
      ? fallbackRegionIds((await getRegionTree(req)).chainById.keys(), ownerById, clientId)
      : ownedRegionIds(ownerById, clientId)
  // Nothing owned means nothing to enumerate — and, more usefully, no reads
  // at all: `id: { in: [] }` would be two round trips to learn what the
  // ownership map already said.
  const docs = regionIds.length === 0 ? [] : await ownedDocuments(req, regionIds)

  const titleByRoute = new Map<string, string>()
  for (const doc of docs) {
    const title = doc.name ?? doc.title
    if (doc.webPath && title) titleByRoute.set(doc.webPath, title)
  }

  return { urls: sitemapUrls(docs), titleByRoute }
}
