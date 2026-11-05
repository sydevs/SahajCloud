/**
 * What is open on the Sahaj Atlas, for one role.
 *
 * One cohesive surface, imported as a unit by the three homes' loaders and by
 * the nightly digest — so this folder gets a barrel (`src/AGENTS.md`). The
 * status table is the load-bearing part: every word a reader sees about an open
 * item is in `status.ts` and nowhere else.
 *
 * ⚠ **A `'use client'` component must import `./filters` by its own path, not
 * through here.** This barrel reaches the loaders, and through them the whole
 * submissions and email layer — a browser entry taking one filter name off it
 * would pull `@/lib/env/server` into an admin chunk, and the build would fail
 * on the Railway deploy rather than in CI (`src/AGENTS.md`).
 * `tests/unit/client-bundle-safety.spec.ts` is what holds that.
 */

export {
  OPEN_ITEM_FILTER_LABELS,
  OPEN_ITEM_FILTERS,
  OPEN_ITEM_STATUSES,
  type OpenItemFilter,
  type OpenItemPill,
  type OpenItemStatusKey,
} from './filters'
export { loadOpenItems, type OpenItemsResult, withRecommendations } from './openItems'
export {
  loadRegionOverview,
  type RegionOverviewRow,
  rollUpRegionMetrics,
  SIGNUP_WINDOW_DAYS,
  sortRegionRows,
} from './regions'
export {
  loadRegionNodes,
  mayOpenRegion,
  type OverviewArgs,
  type OverviewScope,
  type RegionNode,
  regionsWithNoManagerAbove,
  scopeRegionIds,
  subtreeOf,
} from './scope'
export { snapshotDate } from './snapshots'
export {
  CHANGE_WINDOW_DAYS,
  loadStatistics,
  type OverviewStatistics,
  type StatTile,
  sumSnapshot,
} from './statistics'
export {
  type OpenItem,
  type OpenItemEvent,
  openItem,
  openItemFilters,
  type OpenItemProposal,
  type OpenItemRefusal,
  type OpenItemRow,
  openItemStatus,
  type OpenItemStatus,
  type OpenItemTarget,
  overviewProgress,
  type OverviewProgress,
  sortOpenItems,
} from './status'
