import type { PaginatedDocs, PayloadRequest } from 'payload'

import {
  loadOpenItems,
  loadRegionOverview,
  loadStatistics,
  type OverviewStatistics,
  type RegionOverviewRow,
} from '@/lib/atlasOverview'
import { SPAM_SIGNUPS_PATH, spamSignups } from '@/lib/atlasOverview/refusals'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { type DashboardQuery, type OpenItemsData, paginate } from '../shared/model'
import { openItemsData } from '../shared/rows'

export interface AtlasAdminData {
  countries: PaginatedDocs<RegionOverviewRow>
  /** How many countries the map holds, for the header's description. */
  countryCount: number
  items: OpenItemsData
  /**
   * The finished "N sign-ups filed as spam in the last 7 days" line and its
   * list, or `null` for a quiet week. Built rather than counted, so the home and
   * the admin digest cannot word it differently (`atlasOverview/refusals.ts`).
   */
  spamSignups: null | { href: string; text: string }
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

  const [result, statistics, countries, spam] = await Promise.all([
    loadOpenItems({ now, overrideAccess: false, req, scope }),
    loadStatistics({ now, overrideAccess: false, req: localeIsolatedReq(req), scope }),
    loadRegionOverview({
      countriesOnly: true,
      now,
      req: localeIsolatedReq(req),
      scope,
    }),
    spamSignups({ now, overrideAccess: false, req: localeIsolatedReq(req) }),
  ])

  return {
    countries: paginate(countries, query.page, query.limit),
    countryCount: countries.length,
    items: await openItemsData({ now, query, req, result }),
    spamSignups: spam && { href: `/admin${SPAM_SIGNUPS_PATH}`, text: spam.text },
    statistics,
  }
}
