import type { PaginatedDocs, PayloadRequest } from 'payload'

import {
  loadOpenItems,
  loadRegionNodes,
  loadRegionOverview,
  loadStatistics,
  mayOpenRegion,
  type OverviewScope,
  type OverviewStatistics,
  type RegionNode,
  type RegionOverviewRow,
} from '@/lib/atlasOverview'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { isAdminManager } from '@/plugins/access/adminOnly'

import { type DashboardQuery, type OpenItemsData, paginate } from '../shared/model'
import { openItemsData } from '../shared/rows'

export interface AtlasRegionData {
  /** `false` renders the unauthorized view instead — a region outside the subtree. */
  allowed: boolean
  /** The breadcrumb trail, nearest last, for `SetStepNav`. */
  breadcrumbs: { label: string; url?: string }[]
  /** "<region> · N programs · M managers". */
  description: string
  items: OpenItemsData
  regions: PaginatedDocs<RegionOverviewRow>
  statistics: OverviewStatistics
}

const EMPTY_ITEMS = (query: DashboardQuery): OpenItemsData => ({
  counts: { all: 0, mine: 0, 'no-manager': 0, overdue: 0, recommendations: 0, review: 0 },
  progress: null,
  query,
  rows: paginate([], 1, query.limit),
})

/**
 * A region manager's home, and an admin's view of one region.
 *
 * ⚠ **`?region=` is a URL anyone can type**, so the scope is resolved before
 * anything is read: a region manager outside their own subtree gets
 * `allowed: false` and the unauthorized view, while an admin may open any
 * region. `scopeRegionIds` answers the same question for the queries, so a
 * refusal here and an empty list there cannot disagree.
 */
export async function getAtlasRegionData(
  req: PayloadRequest,
  query: DashboardQuery,
): Promise<AtlasRegionData> {
  const now = new Date()
  const admin = isAdminManager(req.user)
  const managerId = admin ? null : Number(req.user!.id)
  const regionId = query.region || undefined
  const nodes = await loadRegionNodes(req)

  if (regionId !== undefined && managerId !== null) {
    if (!(await mayOpenRegion(req, managerId, regionId, nodes))) {
      return {
        allowed: false,
        breadcrumbs: [],
        description: '',
        items: EMPTY_ITEMS(query),
        regions: paginate([], 1, query.limit),
        statistics: { analytics: [], health: [], mostRegistered: null },
      }
    }
  }

  const scope: OverviewScope = { managerId, regionId, role: 'region' }

  const [result, statistics, regionRows] = await Promise.all([
    loadOpenItems({ now, overrideAccess: false, req, scope }),
    loadStatistics({ now, overrideAccess: false, req: localeIsolatedReq(req), scope }),
    loadRegionOverview({ now, overrideAccess: false, req: localeIsolatedReq(req), scope }),
  ])

  const node = regionId === undefined ? undefined : nodes.get(regionId)
  const totals = regionRows.find((row) => row.id === regionId)
  const programs = totals?.programs ?? regionRows.reduce((sum, row) => sum + row.programs, 0)
  const managers = totals?.managers ?? Math.max(...regionRows.map((row) => row.managers), 0)

  return {
    allowed: true,
    breadcrumbs: breadcrumbsFor(node, nodes, admin),
    description: [
      node?.name ?? 'Your regions',
      `${programs} program${programs === 1 ? '' : 's'}`,
      `${managers} manager${managers === 1 ? '' : 's'}`,
    ].join(' · '),
    items: await openItemsData({ now, query, req, result }),
    regions: paginate(
      // A region's own row is the header's description, not a row under it.
      regionRows.filter((row) => row.id !== regionId),
      query.page,
      query.limit,
    ),
    statistics,
  }
}

/**
 * "Sahaj Atlas › Germany" for an admin, "Your regions › Upper Bavaria" for a
 * manager — the trail says whose map this is before it says where in it.
 */
function breadcrumbsFor(
  node: RegionNode | undefined,
  nodes: Map<number, RegionNode>,
  admin: boolean,
): AtlasRegionData['breadcrumbs'] {
  const root = { label: admin ? 'Sahaj Atlas' : 'Your regions', url: '/admin' }
  if (!node) return [root]
  const trail = node.ancestorIds
    .map((id) => nodes.get(id))
    .filter((ancestor): ancestor is RegionNode => ancestor !== undefined)
    .map((ancestor) => ({ label: ancestor.name, url: `/admin?region=${ancestor.id}` }))
  return [root, ...trail, { label: node.name }]
}
