import type { DashboardQuery, OpenItemsData } from '../shared/model'
import type { PayloadRequest } from 'payload'

import type { OverviewStatistics } from '@/lib/atlasOverview/statistics'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { loadHomeBase } from '../shared/rows'

export interface AtlasManagerData {
  canCreate: boolean
  items: OpenItemsData
  statistics: OverviewStatistics
}

/** A program manager's home: the events they manage, most urgent first. */
export async function getAtlasManagerData(
  req: PayloadRequest,
  query: DashboardQuery,
): Promise<AtlasManagerData> {
  const now = new Date()
  const scope = { managerId: Number(req.user!.id), role: 'program' } as const
  const [canCreate, base] = await Promise.all([
    req.payload.collections.events!.config.access.create!({ req: localeIsolatedReq(req) }),
    loadHomeBase({ now, query, req, scope }),
  ])
  return { canCreate: canCreate === true, ...base }
}
