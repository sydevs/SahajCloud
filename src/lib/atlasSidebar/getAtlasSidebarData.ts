/**
 * Atlas sidebar data fetch + cache.
 *
 * Computes the per-manager sidebar payload — the bucketed event list and the
 * owned-region subtree with rolled-up counts — with a bounded number of queries:
 *
 *   1. the manager's own events (incl. trashed) for the event list,
 *   2. the regions they directly manage,
 *   3. those regions' whole subtree (one breadcrumb query),
 *   4. all non-trashed events in that subtree for the counts.
 *
 * The result is memoized per (manager, locale) via `unstable_cache` under the
 * `atlas-sidebar` tag(s); see `cache.ts` for invalidation. The cached function
 * returns plain serializable data — the React rendering happens by the caller.
 */

import type { TypedLocale, Where } from 'payload'

import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

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

  // 2. The regions the manager directly manages (the subtree roots). Runs
  // first: the event list now also needs the subtree ids (see below).
  // `select: {}` returns only `id` — all we need for the subtree roots.
  const ownedRegions = await payload.find({
    collection: 'regions',
    where: { managers: { in: [managerId] } },
    depth: 0,
    pagination: false,
    select: {},
  })
  const ownedRegionIds = ownedRegions.docs.map((doc) => doc.id)

  // 3. Those roots plus every descendant (one breadcrumb query).
  const subtree = ownedRegionIds.length
    ? await payload.find({
        collection: 'regions',
        where: {
          or: [{ id: { in: ownedRegionIds } }, { 'breadcrumbs.doc': { in: ownedRegionIds } }],
        },
        depth: 0,
        pagination: false,
        select: { name: true, level: true, parent: true, breadcrumbs: true },
      })
    : null
  const regionInputs = (subtree?.docs ?? []).map(toRegionInput)
  const regionById = new Map(regionInputs.map((region) => [region.id, region]))
  const subtreeRegionIds = new Set(regionInputs.map((region) => region.id))

  // The event list: the manager's own events (incl. trashed — "Trashed" is a
  // bucket), plus the pre-adoption (unverified/denied) events in their region
  // subtree. The latter have no manager at all, so without this OR branch no
  // sidebar would ever surface them and nobody would find them to adopt.
  const eventListWhere: Where = subtreeRegionIds.size
    ? {
        or: [
          { manager: { equals: managerId } },
          {
            and: [
              { verificationStage: { in: ['unverified', 'denied'] } },
              { region: { in: [...subtreeRegionIds] } },
            ],
          },
        ],
      }
    : { manager: { equals: managerId } }

  // Queries 1 and 4 are independent of each other — run them together.
  const [listEvents, subtreeEvents] = await Promise.all([
    // 1. Events for the sidebar list.
    payload.find({
      collection: 'events',
      where: eventListWhere,
      trash: true,
      depth: 0,
      pagination: false,
      locale,
      select: { title: true, verificationStage: true, deletedAt: true, updatedAt: true },
    }),
    // 4. Non-trashed events in the subtree, for the published/total counts.
    subtreeRegionIds.size
      ? payload.find({
          collection: 'events',
          where: { region: { in: [...subtreeRegionIds] } },
          depth: 0,
          pagination: false,
          select: { region: true, _status: true, verificationStage: true, deletedAt: true },
        })
      : null,
  ])
  const events = sortEventsIntoBuckets(listEvents.docs.map(toEventInput))

  let regions: RegionTreeNode[] = []
  if (subtreeEvents) {
    const counts = rollUpRegionCounts(
      subtreeEvents.docs.map((doc) => toCountInput(doc, regionById)),
      subtreeRegionIds,
    )
    regions = buildRegionTree(regionInputs, counts)
  }

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
