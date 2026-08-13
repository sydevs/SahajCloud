/**
 * Atlas sidebar data fetch + cache.
 *
 * Computes the per-manager sidebar payload — the bucketed event list and the
 * owned-region subtree with rolled-up counts — with a bounded number of queries:
 *
 *   1. the manager's own events (incl. trashed) for the event list,
 *   2. the regions they directly manage,
 *   3. those regions' whole subtree (one breadcrumb query),
 *   4. all non-trashed events in that subtree — for the region counts *and*
 *      the pre-adoption events the manager could adopt (those have no manager,
 *      so query 1 can't see them).
 *
 * The result is memoized per (manager, locale) via `unstable_cache` under the
 * `atlas-sidebar` tag(s); see `cache.ts` for invalidation. The cached function
 * returns plain serializable data — the React rendering happens by the caller.
 */

import type { TypedLocale } from 'payload'

import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { isPreAdoptionStage } from '@/lib/eventVerification/stages'
import { breadcrumbAncestorIds, relationId } from '@/plugins/access/documentManagers'

import config from '@payload-config'

import { ATLAS_SIDEBAR_TAG, atlasSidebarManagerTag } from './cache'
import {
  buildRegionTree,
  type RegionTreeNode,
  type SidebarCountEventInput,
  type SidebarEventInput,
  type SidebarEventItem,
  type SidebarRegionInput,
  rollUpRegionCounts,
  sortEventsIntoBuckets,
} from './sidebarModel'

export interface AtlasSidebarData {
  events: SidebarEventItem[]
  regions: RegionTreeNode[]
}

/** The fields a sidebar event row renders. */
const EVENT_LIST_SELECT = {
  title: true,
  verificationStage: true,
  deletedAt: true,
  updatedAt: true,
} as const

function toEventInput(doc: Record<string, unknown>): SidebarEventInput {
  return {
    id: doc.id as number,
    title: typeof doc.title === 'string' ? doc.title : null,
    verificationStage: doc.verificationStage as SidebarEventInput['verificationStage'],
    deletedAt: (doc.deletedAt as string | null | undefined) ?? null,
    updatedAt: (doc.updatedAt as string | null | undefined) ?? null,
  }
}

function toRegionInput(doc: Record<string, unknown>): SidebarRegionInput {
  const id = doc.id as number
  return {
    id,
    name: typeof doc.name === 'string' ? doc.name : null,
    level: doc.level as SidebarRegionInput['level'],
    parentId: relationId(doc.parent),
    ancestorIds: breadcrumbAncestorIds(doc, id),
  }
}

function toCountInput(
  doc: Record<string, unknown>,
  regionById: Map<number, SidebarRegionInput>,
): SidebarCountEventInput {
  const regionId = relationId(doc.region) ?? -1
  const deleted = Boolean(doc.deletedAt)
  // `finished` events count toward neither bucket — they've run their course.
  const active = !deleted && doc.verificationStage !== 'finished'
  return {
    regionId,
    ancestorRegionIds: regionById.get(regionId)?.ancestorIds ?? [],
    published: active && doc._status === 'published',
    countsTowardTotal: active,
  }
}

/**
 * Uncached builder — exported for integration tests to exercise the query layer
 * directly. Production code goes through {@link getAtlasSidebarData}.
 */
export async function buildAtlasSidebarData(
  managerId: number,
  locale: TypedLocale,
): Promise<AtlasSidebarData> {
  const payload = await getPayload({ config })

  // Queries 1 and 2 are independent — run them together.
  const [ownEvents, ownedRegions] = await Promise.all([
    // 1. The manager's own events (incl. trashed — "Trashed" is a bucket).
    payload.find({
      collection: 'events',
      where: { manager: { equals: managerId } },
      trash: true,
      depth: 0,
      pagination: false,
      locale,
      select: EVENT_LIST_SELECT,
    }),
    // 2. The regions the manager directly manages (the subtree roots).
    // `select: {}` returns only `id` — all we need for the subtree roots.
    payload.find({
      collection: 'regions',
      where: { managers: { in: [managerId] } },
      depth: 0,
      pagination: false,
      select: {},
    }),
  ])
  const ownedRegionIds = ownedRegions.docs.map((doc) => doc.id)

  let regions: RegionTreeNode[] = []
  // Pre-adoption events have no manager, so query 1 can't see them — but they
  // are exactly what a region manager needs to find in order to adopt one.
  // They come out of the subtree read below rather than a second event query.
  let adoptable: SidebarEventInput[] = []

  if (ownedRegionIds.length) {
    // 3. Those roots plus every descendant (one breadcrumb query).
    const subtree = await payload.find({
      collection: 'regions',
      where: {
        or: [{ id: { in: ownedRegionIds } }, { 'breadcrumbs.doc': { in: ownedRegionIds } }],
      },
      depth: 0,
      pagination: false,
      select: { name: true, level: true, parent: true, breadcrumbs: true },
    })
    const regionInputs = subtree.docs.map(toRegionInput)
    const regionById = new Map(regionInputs.map((region) => [region.id, region]))
    const subtreeRegionIds = new Set(regionInputs.map((region) => region.id))

    // 4. Non-trashed events in the subtree. Feeds both the region counts and
    // the adoptable list — the extra `title`/`updatedAt` in the select is the
    // whole cost of surfacing pre-adoption events in the sidebar.
    const subtreeEvents = await payload.find({
      collection: 'events',
      where: { region: { in: [...subtreeRegionIds] } },
      depth: 0,
      pagination: false,
      locale,
      select: { region: true, _status: true, ...EVENT_LIST_SELECT },
    })
    const counts = rollUpRegionCounts(
      subtreeEvents.docs.map((doc) => toCountInput(doc, regionById)),
      subtreeRegionIds,
    )
    regions = buildRegionTree(regionInputs, counts)
    adoptable = subtreeEvents.docs
      .filter((doc) => isPreAdoptionStage(doc.verificationStage))
      .map(toEventInput)
  }

  const events = sortEventsIntoBuckets([...ownEvents.docs.map(toEventInput), ...adoptable])

  return { events, regions }
}

/**
 * Cached entry point: the manager's sidebar data, memoized per (manager,
 * locale). Invalidated by `revalidateAtlasSidebar()` on any event/region write.
 */
export function getAtlasSidebarData(
  managerId: number,
  locale: TypedLocale,
): Promise<AtlasSidebarData> {
  return unstable_cache(
    () => buildAtlasSidebarData(managerId, locale),
    [ATLAS_SIDEBAR_TAG, String(managerId), locale],
    {
      tags: [ATLAS_SIDEBAR_TAG, atlasSidebarManagerTag(managerId)],
    },
  )()
}
