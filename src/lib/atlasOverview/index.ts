/**
 * What is open on the Sahaj Atlas, for one role.
 *
 * One cohesive surface, imported as a unit by the three homes and by the
 * nightly digest — so this folder gets a barrel (`src/AGENTS.md`). The status
 * table is the load-bearing part: every word a reader sees about an open item
 * is in `status.ts` and nowhere else.
 */

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
  OPEN_ITEM_FILTER_LABELS,
  OPEN_ITEM_FILTERS,
  OPEN_ITEM_STATUSES,
  type OpenItem,
  type OpenItemEvent,
  type OpenItemFilter,
  openItem,
  openItemFilters,
  type OpenItemProposal,
  type OpenItemRefusal,
  type OpenItemRow,
  openItemStatus,
  type OpenItemStatus,
  type OpenItemStatusKey,
  type OpenItemTarget,
  overviewProgress,
  type OverviewProgress,
  sortOpenItems,
} from './status'
