/**
 * What is open on the Sahaj Atlas, for one role.
 *
 * One cohesive surface, imported as a unit by the three homes' loaders and by
 * the nightly digest — so this folder gets a barrel (`src/AGENTS.md`). The
 * status table is the load-bearing part: every word a reader sees about an open
 * item is in `status.ts` and nowhere else.
 *
 * ⚠ **This carries what a consumer takes off it, and nothing else.** A barrel
 * is also the list of ways to reach the hazard below, so a name no caller
 * imports through here stays module-private or is deep-imported where it is
 * used — `rollUpRegionMetrics`, `subtreeOf` and the rest of the tree helpers
 * are one folder's own workings, and `tests/unit/lib-boundary.spec.ts` answers
 * for the folder by its entry point rather than by each file.
 *
 * ⚠ **A `'use client'` component must import `./filters` by its own path, not
 * through here.** The hazard is this file, not the folder — see `src/AGENTS.md`,
 * which `tests/unit/client-bundle-safety.spec.ts` holds.
 */

export { type OpenItemFilter } from './filters'
export { loadOpenItems, type OpenItemsResult, withRecommendations } from './openItems'
export { loadRegionOverview, type RegionOverviewRow } from './regions'
export { loadRegionNodes, mayOpenRegion, type OverviewScope, type RegionNode } from './scope'
export { loadStatistics, type OverviewStatistics, type StatTile } from './statistics'
export { type OpenItem, openItemFilters, type OpenItemStatus, type OpenItemTarget } from './status'
