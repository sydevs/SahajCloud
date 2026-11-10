import type { PayloadRequest } from 'payload'

import { descendantRegionIds, type RegionTree } from '@/lib/atlas/regionTree'
import { resolveOwnedRegionIds } from '@/plugins/access/regionSubtreeAccess'

/**
 * Whose overview this is.
 *
 * ⚠ **A role, never a user.** One manager can wear all four hats, and each
 * sees a different list, so every loader is told which.
 */
export type OverviewScope =
  | { role: 'admin' }
  | { role: 'program'; managerId: number }
  /** The services a manager is listed on; only the digest reads it. */
  | { role: 'service'; managerId: number }
  | {
      role: 'region'
      /** `null` for an admin viewing a region, who has no owned set to intersect. */
      managerId: null | number
      regionId?: number
    }

export interface OverviewArgs {
  req: PayloadRequest
  scope: OverviewScope
  /** `false` on a page, so the reader sees what their access admits; `true` in the digest job. */
  overrideAccess: boolean
  now: Date
}

/** The region ids a scope covers, or `null` for the whole map. */
export async function scopeRegionIds(
  req: PayloadRequest,
  scope: OverviewScope,
  tree: RegionTree,
): Promise<null | Set<number>> {
  if (scope.role !== 'region') return null
  const subtree = (id: number) => new Set(descendantRegionIds(tree.chainById, id))
  if (scope.managerId === null) return scope.regionId === undefined ? null : subtree(scope.regionId)

  // ⚠ Already a subtree (`resolveManagedDocIds` follows `breadcrumbs.doc`), so not expanded again.
  const owned = new Set(await resolveOwnedRegionIds(req, scope.managerId))
  if (scope.regionId === undefined) return owned
  // `?region=` is a URL anyone can type.
  return owned.has(scope.regionId) ? subtree(scope.regionId) : new Set()
}
