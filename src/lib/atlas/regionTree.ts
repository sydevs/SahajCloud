import type { PayloadRequest } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

/**
 * The Regions tree, resolved once per request: every region's canonical Atlas
 * web path, and the ancestor chain each path was built from.
 *
 * A region's `webPath` is the ordered slug chain of its ancestors including
 * itself (`/belgium/flanders/antwerp`). The nested-docs plugin already keeps a
 * denormalized `breadcrumbs` trail (`[root, …, self]`) on every region and
 * re-saves descendants when ancestry changes, so this resolver just maps that
 * trail to current slugs — it never re-derives the hierarchy. Reading slugs
 * fresh (rather than off a stored breadcrumb URL) means a slug rename is
 * reflected on the next read with no backfill.
 *
 * The chain is exposed alongside the path because canonical **ownership**
 * resolves by walking it (see `./regionOwners`) — computing it twice from the
 * same breadcrumbs would be two ways for one hierarchy to disagree.
 */

/** The breadcrumb + slug shape this resolver reads off a region row. */
interface RegionRow {
  id: number
  slug?: string | null
  breadcrumbs?: Array<{ doc?: unknown }> | null
}

/** Everything the single `regions` query yields, keyed by region id. */
export interface RegionTree {
  /** Canonical web path (`/belgium/flanders/antwerp`), absent when a segment is blank. */
  pathById: Map<number, string>
  /** Ordered ancestor ids, root → self. Always terminal-inclusive. */
  chainById: Map<number, number[]>
}

/**
 * Per-request memo of the tree, keyed by the `PayloadRequest` (one per
 * request). Every webPath/webUrl read in a single request — the whole geojson
 * feed included — then shares one `regions` query.
 */
const requestCache = new WeakMap<PayloadRequest, Promise<RegionTree>>()

/**
 * Join an ordered chain of slugs into a canonical path, or `null` when any
 * segment is missing or blank.
 *
 * The single definition of "what a region path looks like", shared by this
 * resolver and the nested-docs `generateURL` that stores the same value on
 * `breadcrumbs.url` — so the canonical URL and the path *lookup* cannot
 * disagree. A gap (an ancestor with no slug) yields no path at all rather than
 * a `//`-containing one: 16 regions have a blank name today, and a malformed
 * canonical URL is worse than an absent one.
 */
export function buildRegionPath(slugs: Array<string | null | undefined>): string | null {
  if (slugs.length === 0) return null
  if (!slugs.every((slug): slug is string => typeof slug === 'string' && slug.length > 0))
    return null
  return `/${slugs.join('/')}`
}

/**
 * Ordered region ids for a region's breadcrumb trail (root → self). The
 * nested-docs plugin stores self as the last breadcrumb, so the mapped chain is
 * already terminal-inclusive. When the trail is missing or holds no resolvable
 * ids (a root, a not-yet-populated create, or corrupt breadcrumbs) it collapses
 * to `[id]` — the region's own globally-unique slug still resolves.
 */
function breadcrumbChainIds(region: RegionRow, id: number): number[] {
  const crumbs = region.breadcrumbs
  if (!Array.isArray(crumbs)) return [id]
  const ids = crumbs
    .map((crumb) => relationId(crumb?.doc))
    .filter((crumbId): crumbId is number => crumbId !== null)
  return ids.length > 0 ? ids : [id]
}

async function loadRegionTree(req: PayloadRequest): Promise<RegionTree> {
  const { docs } = await req.payload.find({
    collection: 'regions',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    // Only the slug (each segment) and the breadcrumb chain (the ordering) are
    // read. Excluding every other field also skips their afterRead hooks — this
    // resolver's own webPath/webUrl among them — so this query can't recurse
    // back into the resolver (see stripUnselectedFields: an unselected field
    // returns before its hook runs). Anything added here must be checked
    // against that same rule.
    select: { slug: true, breadcrumbs: true },
    req,
  })
  const rows = docs as RegionRow[]

  // Two passes: collect every slug first — a region's chain references ancestor
  // ids that may sort after it in `rows` — then resolve each chain to a path.
  const slugById = new Map<number, string>()
  for (const row of rows) {
    if (typeof row.slug === 'string' && row.slug) slugById.set(row.id, row.slug)
  }

  const pathById = new Map<number, string>()
  const chainById = new Map<number, number[]>()
  for (const row of rows) {
    const chain = breadcrumbChainIds(row, row.id)
    chainById.set(row.id, chain)
    const path = buildRegionPath(chain.map((crumbId) => slugById.get(crumbId)))
    if (path !== null) pathById.set(row.id, path)
  }
  return { pathById, chainById }
}

/**
 * Resolve the region tree for the current request in a single `regions` query.
 * Memoized per request, so a bulk read (the geojson feed) pays for exactly one.
 */
export function getRegionTree(req: PayloadRequest): Promise<RegionTree> {
  let cached = requestCache.get(req)
  if (!cached) {
    cached = loadRegionTree(req)
    requestCache.set(req, cached)
  }
  return cached
}

/**
 * Every region's canonical web path, keyed by region id — the long-standing
 * entry point, now a thin projection of {@link getRegionTree} so a `webPath`
 * read still costs exactly one query and never touches canonical ownership.
 */
export async function getRegionWebPaths(req: PayloadRequest): Promise<Map<number, string>> {
  return (await getRegionTree(req)).pathById
}
