/**
 * Atlas sidebar cache tag + invalidation.
 *
 * The per-manager sidebar tree/counts are expensive to compute, so they're
 * memoized with Next's `unstable_cache` (see `getAtlasSidebarData.ts`) under the
 * `atlas-sidebar` tag. Anything that mutates events or regions busts the tag.
 *
 * Cross-boundary: imported by the Events/Regions collection hooks and the
 * ExpireEvents job as well as the sidebar fetcher — hence it lives in `lib` and
 * pulls in nothing but `next/cache`.
 */

import { revalidateTag } from 'next/cache'

/** Cache tag covering every manager's Atlas sidebar data. */
export const ATLAS_SIDEBAR_TAG = 'atlas-sidebar'

/** Per-manager cache tag, for targeted invalidation. */
export function atlasSidebarManagerTag(managerId: number | string): string {
  return `${ATLAS_SIDEBAR_TAG}:${managerId}`
}

/**
 * Invalidate the Atlas sidebar cache (best-effort).
 *
 * `revalidateTag` is only valid inside a Next.js request/render scope. Event and
 * region writes also happen outside one — notably the nightly ExpireEvents job
 * and CLI/seed scripts — where it throws. Swallow that: the cache then simply
 * serves slightly stale data until its next natural recomputation, which is an
 * acceptable trade for never failing a write.
 */
export function revalidateAtlasSidebar(): void {
  try {
    // Next 16: the second arg is required; 'max' is the drop-in for the old
    // single-arg immediate-invalidation behavior.
    revalidateTag(ATLAS_SIDEBAR_TAG, 'max')
  } catch {
    // Outside a Next.js request scope (background job, CLI, seed) — best-effort.
  }
}
