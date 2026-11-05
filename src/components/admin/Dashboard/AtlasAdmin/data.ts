import type { PaginatedDocs, PayloadRequest } from 'payload'

import {
  loadOpenItems,
  loadRegionOverview,
  loadStatistics,
  type OverviewStatistics,
  type RegionOverviewRow,
} from '@/lib/atlasOverview'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { type DashboardQuery, type OpenItemsData, paginate } from '../shared/model'
import { openItemsData } from '../shared/rows'

/** How far back the home counts sign-ups the form turned away. */
const REFUSAL_WINDOW_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export interface AtlasAdminData {
  countries: PaginatedDocs<RegionOverviewRow>
  /** How many countries the map holds, for the header's description. */
  countryCount: number
  items: OpenItemsData
  /** Sign-ups the form refused in the last week, or `null` for none. */
  refusedAtTheForm: null | number
  statistics: OverviewStatistics
}

/**
 * The admin's home: only what nobody below them covers.
 *
 * ⚠ **Not "everything".** A region with a manager anywhere above it is that
 * manager's work, and listing it here would ask an admin to do everyone's —
 * which is what the previous home's "Needs attention" row did, and why it is
 * gone. `loadOpenItems` applies the rule; this loader only draws the result.
 */
export async function getAtlasAdminData(
  req: PayloadRequest,
  query: DashboardQuery,
): Promise<AtlasAdminData> {
  const now = new Date()
  const scope = { role: 'admin' } as const

  const [result, statistics, countries, refusals] = await Promise.all([
    loadOpenItems({ now, overrideAccess: false, req, scope }),
    loadStatistics({ now, overrideAccess: false, req: localeIsolatedReq(req), scope }),
    loadRegionOverview({
      countriesOnly: true,
      now,
      overrideAccess: false,
      req: localeIsolatedReq(req),
      scope,
    }),
    req.payload.find({
      collection: 'registration-refusals',
      depth: 0,
      overrideAccess: false,
      pagination: false,
      req: localeIsolatedReq(req),
      select: { count: true },
      where: {
        and: [
          { stage: { equals: 'request' } },
          { hour: { greater_than: new Date(now.getTime() - REFUSAL_WINDOW_DAYS * DAY_MS).toISOString() } },
        ],
      },
    }),
  ])

  const refused = refusals.docs.reduce((sum, row) => sum + (row.count ?? 0), 0)

  return {
    countries: paginate(countries, query.page, query.limit),
    countryCount: countries.length,
    items: await openItemsData({ now, query, req, result }),
    refusedAtTheForm: refused > 0 ? refused : null,
    statistics,
  }
}
