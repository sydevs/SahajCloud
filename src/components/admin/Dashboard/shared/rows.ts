import type { PayloadRequest } from 'payload'

import { type OpenItemsResult, withRecommendations } from '@/lib/atlasOverview/openItems'
import type { OpenItem, OpenItemTarget } from '@/lib/atlasOverview/status'
import { adminDocPath } from '@/lib/utilities/adminUrl'

import { type DashboardQuery, type OpenItemsData, type OpenItemsRow, paginate } from './model'

/**
 * The page a next step opens.
 *
 * ⚠ **Relative, not absolute.** `adminDocPath` is the in-panel spelling — Next
 * prepends `basePath` itself — and the digest uses `adminDocUrl` for the same
 * target, because an email has to leave the app. One target, two spellings,
 * each from the one helper that owns it (`src/lib/utilities/adminUrl.ts`).
 */
function hrefFor(target: OpenItemTarget): string {
  return adminDocPath(target.collection, target.id)
}

function toRow(item: OpenItem): OpenItemsRow {
  const { placing } = item
  const own = item.row.kind === 'event' ? ('events' as const) : ('user-submissions' as const)
  return {
    action: placing.action
      ? { href: hrefFor(placing.action.target), label: placing.action.label }
      : null,
    filters: item.filters,
    href: adminDocPath(own, item.row.id),
    id: `${item.row.kind}-${item.row.id}`,
    statuses: item.statuses.map((status) => ({
      key: status.key,
      label: status.label,
      line: status.line,
      pill: status.pill,
    })),
    title: item.row.title,
  }
}

/** Whether a row belongs under the filter the reader picked. */
function inFilter(item: OpenItem, filter: DashboardQuery['filter']): boolean {
  if (filter === 'all') return true
  if (filter === 'mine') return item.row.kind === 'event' && Boolean(item.row.ownEvent)
  return item.filters.includes(filter)
}

/**
 * Turn a loader's answer into one page a client view can render.
 *
 * The recommendations' own labels are read for the page's rows alone (see
 * `withRecommendations`), so the enrichment happens after the paging rather
 * than before it.
 */
export async function openItemsData(args: {
  now: Date
  query: DashboardQuery
  req: PayloadRequest
  result: OpenItemsResult
}): Promise<OpenItemsData> {
  const { now, query, req, result } = args
  const filtered = result.items.filter((item) => inFilter(item, query.filter))
  const page = paginate(filtered, query.page, query.limit)
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
    counts,
    progress: result.progress,
    query: { ...query, page: page.page ?? query.page },
    rows: { ...page, docs: enriched.map(toRow) },
  }
}
