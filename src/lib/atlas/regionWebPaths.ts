import type { PayloadRequest } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

/**
 * Canonical Atlas web paths for the Regions tree, resolved once per request.
 *
 * A region's `webPath` is the ordered slug chain of its ancestors including
 * itself (`/belgium/flanders/antwerp`). The nested-docs plugin already keeps a
 * denormalized `breadcrumbs` trail (`[root, …, self]`) on every region and
 * re-saves descendants when ancestry changes, so this resolver just maps that
 * trail to current slugs — it never re-derives the hierarchy. Reading slugs
 * fresh (rather than off a stored breadcrumb URL) means a slug rename is
 * reflected on the next read with no backfill.
 */

/** The breadcrumb + slug shape this resolver reads off a region row. */
interface RegionRow {
  id: number
  slug?: string | null
  breadcrumbs?: Array<{ doc?: unknown }> | null
}

/**
 * Per-request memo of the id → path map, keyed by the `PayloadRequest` (one per
 * request). Every webPath/webUrl read in a single request — the whole geojson
 * feed included — then shares one `regions` query.
 */
const requestCache = new WeakMap<PayloadRequest, Promise<Map<number, string>>>()

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

async function loadRegionWebPaths(req: PayloadRequest): Promise<Map<number, string>> {
  const { docs } = await req.payload.find({
    collection: 'regions',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    // Only the slug (each segment) and the breadcrumb chain (the ordering) are
    // read. Excluding every other field also skips their afterRead hooks — this
    // resolver's own webPath/webUrl among them — so this query can't recurse
    // back into the resolver (see stripUnselectedFields: an unselected field
    // returns before its hook runs).
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
  for (const row of rows) {
    const segments = breadcrumbChainIds(row, row.id).map((crumbId) => slugById.get(crumbId))
    // Expose a path only when every segment resolves — a gap (an ancestor with
    // no slug) would yield a broken, non-canonical URL, so omit it entirely.
    if (segments.length > 0 && segments.every((s): s is string => Boolean(s))) {
      pathById.set(row.id, `/${segments.join('/')}`)
    }
  }
  return pathById
}

/**
 * Resolve every region's canonical web path for the current request in a single
 * `regions` query, keyed by region id. Memoized per request, so a bulk read
 * (the geojson feed) pays for exactly one query.
 */
export function getRegionWebPaths(req: PayloadRequest): Promise<Map<number, string>> {
  let cached = requestCache.get(req)
  if (!cached) {
    cached = loadRegionWebPaths(req)
    requestCache.set(req, cached)
  }
  return cached
}
