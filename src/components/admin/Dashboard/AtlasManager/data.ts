import type { DashboardQuery, OpenItemsData } from '../shared/model'
import type { PayloadRequest } from 'payload'

import type { OverviewStatistics } from '@/lib/atlasOverview/statistics'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { loadRegionContacts, type RegionContact } from './regionContacts'
import { loadHomeBase } from '../shared/rows'

export interface AtlasManagerData {
  canCreate: boolean
  items: OpenItemsData
  /** Who to ask for an event, when this manager may not create one. */
  regionContacts: RegionContact[]
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
  const mayCreate = canCreate === true
  return {
    canCreate: mayCreate,
    regionContacts: mayCreate ? [] : await loadRegionContacts(req, scope.managerId),
    ...base,
  }
}
