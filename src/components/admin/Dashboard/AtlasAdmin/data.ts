import type { PaginatedDocs, PayloadRequest } from 'payload'

import { SPAM_SIGNUPS_PATH, spamSignups } from '@/lib/atlasOverview/refusals'
import { loadRegionOverview, type RegionOverviewRow } from '@/lib/atlasOverview/regions'
import type { OverviewStatistics } from '@/lib/atlasOverview/statistics'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { type DashboardQuery, type OpenItemsData, paginate } from '../shared/model'
import { loadHomeBase } from '../shared/rows'

export interface AtlasAdminData {
  countries: PaginatedDocs<RegionOverviewRow>
  items: OpenItemsData
  /**
   * The finished "N sign-ups filed as spam" line and its list, or `null` for a
   * quiet week — built, so the home and the digest word it alike.
   */
  spamSignups: null | { href: string; text: string }
  statistics: OverviewStatistics
}

/**
 * The admin's home: only what nobody below them covers.
 *
 * ⚠ **Not "everything".** A region with a manager anywhere above it is that
 * manager's work; `loadOpenItems` applies the rule.
 */
export async function getAtlasAdminData(
  req: PayloadRequest,
  query: DashboardQuery,
): Promise<AtlasAdminData> {
  const now = new Date()
  const scope = { role: 'admin' } as const

  const [base, countries, spam] = await Promise.all([
    loadHomeBase({ now, query, req, scope }),
    loadRegionOverview({ countriesOnly: true, now, req: localeIsolatedReq(req), scope }),
    spamSignups({ now, overrideAccess: false, req: localeIsolatedReq(req) }),
  ])

  return {
    ...base,
    countries: paginate(countries, query.page, query.limit),
    spamSignups: spam && { href: `/admin${SPAM_SIGNUPS_PATH}`, text: spam.text },
  }
}
