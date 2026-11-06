import type { DashboardQuery, OpenItemsData } from '../shared/model'
import type { PayloadRequest } from 'payload'

import { loadOpenItems } from '@/lib/atlasOverview/openItems'
import { loadStatistics, type OverviewStatistics } from '@/lib/atlasOverview/statistics'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { openItemsData } from '../shared/rows'

export interface AtlasManagerData {
  canCreate: boolean
  items: OpenItemsData
  statistics: OverviewStatistics
}

/**
 * A program manager's home: the events they manage, most urgent first.
 *
 * ⚠ **Read with `overrideAccess: false`**, so the list is exactly what their
 * own access admits rather than what this loader believes it should be — the
 * same contract the previous home kept, and what makes the `?region=` and
 * subtree rules below answerable from one place.
 */
export async function getAtlasManagerData(
  req: PayloadRequest,
  query: DashboardQuery,
): Promise<AtlasManagerData> {
  const now = new Date()
  const managerId = Number(req.user!.id)
  const scope = { managerId, role: 'program' } as const
  const access = req.payload.collections.events!.config.access

  // Concurrent reads on one req must not share it (src/collections/AGENTS.md).
  const [canCreate, result, statistics] = await Promise.all([
    access.create!({ req: localeIsolatedReq(req) }),
    loadOpenItems({ now, overrideAccess: false, req, scope }),
    loadStatistics({ now, overrideAccess: false, req: localeIsolatedReq(req), scope }),
  ])

  return {
    canCreate: canCreate === true,
    items: await openItemsData({ now, query, req, result }),
    statistics,
  }
}
