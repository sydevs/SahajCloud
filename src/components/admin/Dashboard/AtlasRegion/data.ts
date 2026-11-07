import type { PaginatedDocs, PayloadRequest } from 'payload'

import { getRegionTree, type RegionTree } from '@/lib/atlas/regionTree'
import { loadRegionOverview, type RegionOverviewRow } from '@/lib/atlasOverview/regions'
import type { OverviewScope } from '@/lib/atlasOverview/scope'
import type { OverviewStatistics } from '@/lib/atlasOverview/statistics'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { isAdminManager } from '@/plugins/access/adminOnly'
import { resolveOwnedRegionIds } from '@/plugins/access/regionSubtreeAccess'

import { type DashboardQuery, type OpenItemsData, paginate } from '../shared/model'
import { loadHomeBase } from '../shared/rows'

export interface AtlasRegionHome {
  allowed: true
  /** The breadcrumb trail, nearest last, for `SetStepNav`. */
  breadcrumbs: { label: string; url?: string }[]
  /** "<region> · N programs · M managers". */
  description: string
  items: OpenItemsData
  regions: PaginatedDocs<RegionOverviewRow>
  statistics: OverviewStatistics
}

/** A union, so a refusal carries no zeroed copy of the home's shapes. */
export type AtlasRegionData = { allowed: false } | AtlasRegionHome

/**
 * A region manager's home, and an admin's view of one region.
 *
 * ⚠ **`?region=` is a URL anyone can type**, so a region manager outside their
 * own subtree is refused before anything is read; an admin may open any region.
 */
export async function getAtlasRegionData(
  req: PayloadRequest,
  query: DashboardQuery,
): Promise<AtlasRegionData> {
  const now = new Date()
  const admin = isAdminManager(req.user)
  const managerId = admin ? null : Number(req.user!.id)
  const regionId = query.region || undefined
  const tree = await getRegionTree(req)

  if (regionId !== undefined && managerId !== null) {
    if (!(await resolveOwnedRegionIds(req, managerId)).includes(regionId)) return { allowed: false }
  }

  const scope: OverviewScope = { managerId, regionId, role: 'region' }

  const [base, regionRows] = await Promise.all([
    loadHomeBase({ now, query, req, scope }),
    loadRegionOverview({ now, req: localeIsolatedReq(req), scope }),
  ])

  const listed = new Set(regionRows.map((row) => row.id))
  const parentOf = (id: number) =>
    tree.chainById
      .get(id)
      ?.filter((link) => link !== id)
      .at(-1)
  // Without `?region=`, the owned subtrees' roots: summing every row would count a city once per ancestor.
  const roots =
    regionId === undefined
      ? regionRows.filter(
          (row) => !tree.chainById.get(row.id)?.some((id) => id !== row.id && listed.has(id)),
        )
      : regionRows.filter((row) => row.id === regionId)
  const programs = roots.reduce((sum, row) => sum + row.programs, 0)
  const managers = new Set(regionRows.flatMap((row) => tree.managersById.get(row.id) ?? [])).size
  // The overview lists one level: the opened region's children, or a lone root's.
  const parentId = regionId ?? (roots.length === 1 ? roots[0]!.id : undefined)
  const levelRows =
    parentId === undefined ? roots : regionRows.filter((row) => parentOf(row.id) === parentId)

  return {
    ...base,
    allowed: true,
    breadcrumbs: breadcrumbsFor(regionId, tree, admin),
    description: [
      regionId !== undefined && tree.chainById.has(regionId)
        ? nameOf(tree, regionId)
        : 'Your regions',
      `${programs} program${programs === 1 ? '' : 's'}`,
      `${managers} manager${managers === 1 ? '' : 's'}`,
    ].join(' · '),
    regions: paginate(levelRows, query.page, query.limit),
  }
}

const nameOf = (tree: RegionTree, id: number) => tree.nameById.get(id)?.trim() || `#${id}`

/**
 * "Sahaj Atlas › Germany" for an admin, "Your regions › Upper Bavaria" for a
 * manager — the trail says whose map this is before it says where in it.
 */
function breadcrumbsFor(
  regionId: number | undefined,
  tree: RegionTree,
  admin: boolean,
): AtlasRegionHome['breadcrumbs'] {
  const root = { label: admin ? 'Sahaj Atlas' : 'Your regions', url: '/admin' }
  const chain = regionId === undefined ? undefined : tree.chainById.get(regionId)
  if (regionId === undefined || !chain) return [root]
  const trail = [...new Set(chain)]
    .filter((id) => id !== regionId && tree.chainById.has(id))
    .map((id) => ({ label: nameOf(tree, id), url: `/admin?region=${id}` }))
  return [root, ...trail, { label: nameOf(tree, regionId) }]
}
