import type { PayloadRequest } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { relationId } from '@/lib/utilities/relationId'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import { breadcrumbAncestorIds } from '@/plugins/access/documentManagers'
import { resolveOwnedRegionIds } from '@/plugins/access/regionSubtreeAccess'

/**
 * Whose overview this is.
 *
 * ⚠ **A role, never a user.** One manager can be a program manager, a region
 * manager and an admin at once, and each hat sees a different list and gets a
 * different email — so every loader here is told which hat, rather than
 * working it out from the user and quietly answering for the widest.
 */
export type OverviewScope =
  | { role: 'admin' }
  | { role: 'program'; managerId: number }
  | {
      role: 'region'
      /**
       * Whose subtree bounds the list, or `null` for an admin looking at a
       * region they do not manage — which is every region, and is why the
       * admin case carries no owned set to intersect with.
       */
      managerId: null | number
      /** One region of that subtree, for `?region=<id>`. */
      regionId?: number
    }

export interface OverviewArgs {
  req: PayloadRequest
  scope: OverviewScope
  /**
   * `false` on a page, so the reader sees exactly what their own access
   * admits; `true` in the digest job, which has an explicit scope and no user.
   */
  overrideAccess: boolean
  /** Overridable clock, for a deterministic test. */
  now?: Date
}

/** A region, its ancestors and its own managers — what every subtree answer needs. */
export interface RegionNode {
  id: number
  name: string
  level: 'city' | 'country' | 'region' | 'venue'
  /**
   * Ancestor ids from the breadcrumb trail, nearest last, excluding self.
   *
   * The immediate parent is `ancestorIds.at(-1)`, so there is no `parentId`
   * beside it: every question here is about the whole chain, and a second
   * spelling of "who is above me" is one that can disagree with the trail.
   */
  ancestorIds: number[]
  managerIds: number[]
}

const REGION_SELECT = {
  name: true,
  breadcrumbs: true,
  level: true,
  managers: true,
} as const

function toNode(doc: Record<string, unknown>): RegionNode {
  const id = doc.id as number
  return {
    id,
    name: typeof doc.name === 'string' && doc.name.trim() ? doc.name : `#${id}`,
    level: doc.level as RegionNode['level'],
    // The nested-docs trail convention has one owner, and it dedupes — which an
    // inline copy here did not, so a trail naming a document twice gave that
    // ancestor two entries and `managersInSubtree` counted its managers twice.
    ancestorIds: breadcrumbAncestorIds(doc, id),
    managerIds: (Array.isArray(doc.managers) ? doc.managers : [])
      .map((manager) => relationId(manager))
      .filter((managerId): managerId is number => managerId !== null),
  }
}

/**
 * Every region, once per request.
 *
 * ⚠ **Read with a query, never off a join's `docs`**, which carries at most its
 * own `limit` (Payload's default is 10) — so a country manager's subtree would
 * silently shrink to ten regions. The whole table is one read of five columns,
 * and the tree questions below are then answered in memory rather than by a
 * query per node.
 *
 * ⚠ **Memoized per request, because every loader in this folder needs it and
 * each is its own entry point.** A region home renders `loadOpenItems`,
 * `loadStatistics` and `loadRegionOverview` beside its own breadcrumb read —
 * four full scans of a table that holds a node per country, region, area, city
 * **and** venue, with a breadcrumbs join each. The digest pays it twice per
 * manager per role. `localeIsolatedReq` copies the locale keys and shares
 * `req.context` by reference, so a nested copy hits this same memo.
 */
export async function loadRegionNodes(req: PayloadRequest): Promise<Map<number, RegionNode>> {
  return memoizeOnRequest(req, 'atlasOverview:regionNodes', async () => {
    const { docs } = await req.payload.find({
      collection: 'regions',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req: localeIsolatedReq(req),
      select: REGION_SELECT,
    })
    return new Map(docs.map((doc) => [doc.id, toNode(doc as Record<string, unknown>)]))
  })
}

/**
 * The regions nobody manages, at any level above them.
 *
 * The same walk `findManagerForRegion` does per event (`recipients.ts`), done
 * once for the whole table — an admin's list asks this of every region, and a
 * query per region is a query per event.
 */
export function regionsWithNoManagerAbove(nodes: Map<number, RegionNode>): Set<number> {
  const unmanaged = new Set<number>()
  for (const node of nodes.values()) {
    const chain = [node.id, ...node.ancestorIds]
    const managed = chain.some((id) => (nodes.get(id)?.managerIds.length ?? 0) > 0)
    if (!managed) unmanaged.add(node.id)
  }
  return unmanaged
}

/** A region and every descendant of it, from the loaded table. */
export function subtreeOf(nodes: Map<number, RegionNode>, roots: number[]): Set<number> {
  const rootSet = new Set(roots)
  const subtree = new Set(roots)
  for (const node of nodes.values()) {
    if (node.ancestorIds.some((id) => rootSet.has(id))) subtree.add(node.id)
  }
  return subtree
}

/**
 * The region ids a scope covers, or `null` for one that covers the whole map.
 *
 * A `regionId` narrows a region manager to that node's own subtree, and is
 * refused outright when it sits outside what they own — `?region=` is a URL
 * anyone can type.
 */
export async function scopeRegionIds(
  // Scoping is a question about the region tree, not about the reader's grants,
  // so it asks for no `overrideAccess` and both shapes of caller satisfy it.
  args: Omit<OverviewArgs, 'overrideAccess'>,
  nodes: Map<number, RegionNode>,
): Promise<null | Set<number>> {
  const { req, scope } = args
  if (scope.role === 'admin' || scope.role === 'program') return null

  if (scope.managerId === null) {
    // An admin's region view: the named region's own subtree, and nothing to
    // intersect it with. With no region named it is the whole map.
    return scope.regionId === undefined ? null : subtreeOf(nodes, [scope.regionId])
  }

  // ⚠ **Already a subtree, so it is not expanded again.** `resolveOwnedRegionIds`
  // delegates to `resolveManagedDocIds`, whose query returns the regions listing
  // the manager **plus every descendant** via `breadcrumbs.doc`, unpaginated —
  // so wrapping it in `subtreeOf` re-derived in memory what the query already
  // answered, and left two readings of "owned region ids" that look different
  // and are not.
  const owned = new Set(await resolveOwnedRegionIds(req, scope.managerId))
  if (scope.regionId === undefined) return owned
  // `?region=` is a URL anyone can type, so a region outside the subtree
  // resolves to nothing rather than to the subtree's own answer.
  if (!owned.has(scope.regionId)) return new Set()
  return subtreeOf(nodes, [scope.regionId])
}

/** Whether a region manager may open a given region's home. */
export async function mayOpenRegion(
  req: PayloadRequest,
  managerId: number,
  regionId: number,
): Promise<boolean> {
  return (await resolveOwnedRegionIds(req, managerId)).includes(regionId)
}
