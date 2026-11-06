import type { PayloadRequest } from 'payload'

import { loadOpenItems, withRecommendations } from '@/lib/atlasOverview/openItems'
import type { OverviewScope } from '@/lib/atlasOverview/scope'
import { loadStatistics, type OverviewStatistics } from '@/lib/atlasOverview/statistics'
import type { OpenItem } from '@/lib/atlasOverview/status'
import { adminDocPath } from '@/lib/utilities/adminUrl'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'

import { type DashboardQuery, type OpenItemsData, type OpenItemsRow, paginate } from './model'

// ⚠ `adminDocPath` is the in-panel spelling — Next prepends `basePath` — where
// the digest, leaving the app, uses `adminDocUrl` for the same target.
function toRow(item: OpenItem): OpenItemsRow {
  const { action } = item.placing
  const own = item.row.kind === 'event' ? ('events' as const) : ('user-submissions' as const)
  return {
    action: action
      ? { href: adminDocPath(action.target.collection, action.target.id), label: action.label }
      : null,
    href: adminDocPath(own, item.row.id),
    id: `${item.row.kind}-${item.row.id}`,
    statuses: item.statuses.map(({ key, label, line, pill }) => ({ key, label, line, pill })),
    title: item.row.title,
  }
}

function inFilter(item: OpenItem, filter: DashboardQuery['filter']): boolean {
  if (filter === 'all') return true
  if (filter === 'mine') return item.row.kind === 'event' && Boolean(item.row.ownEvent)
  return item.filters.includes(filter)
}

/**
 * What every home opens on: the open items, one page of them, and the tiles.
 *
 * ⚠ **Read with `overrideAccess: false`**, so the list is exactly what the
 * reader's own access admits. Recommendations are read for the page's rows
 * alone, so they are added after paging.
 */
export async function loadHomeBase(args: {
  now: Date
  query: DashboardQuery
  req: PayloadRequest
  scope: OverviewScope
}): Promise<{ items: OpenItemsData; statistics: OverviewStatistics }> {
  const { now, query, req, scope } = args
  // Concurrent reads on one req must not share it (src/collections/AGENTS.md).
  const [result, statistics] = await Promise.all([
    loadOpenItems({ now, overrideAccess: false, req, scope }),
    loadStatistics({ now, overrideAccess: false, req: localeIsolatedReq(req), scope }),
  ])

  const page = paginate(
    result.items.filter((item) => inFilter(item, query.filter)),
    query.page,
    query.limit,
  )
  const enriched = await withRecommendations(req, page.docs, now)

  const counts: OpenItemsData['counts'] = {
    all: result.items.length,
    mine: 0,
    'no-manager': 0,
    overdue: 0,
    recommendations: 0,
    review: 0,
  }
  for (const item of result.items) {
    if (inFilter(item, 'mine')) counts.mine += 1
    for (const filter of item.filters) counts[filter] += 1
  }

  return {
    items: {
      counts,
      progress: result.progress,
      query: { ...query, page: page.page ?? query.page },
      rows: { ...page, docs: enriched.map(toRow) },
    },
    statistics,
  }
}
