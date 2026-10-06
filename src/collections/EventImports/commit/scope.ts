/**
 * The request every commit write goes through: a subtree answer that postdates
 * what this commit just created, and cache invalidation deferred to the finish.
 *
 * ⚠ **A warm memo refuses the regions this commit creates**, which #828 names
 * ahead of time. `Events.region` and `Regions.parent` both validate through
 * `ownedRegionFilterOptions`, and Payload runs a relationship's `filterOptions`
 * on every write — `overrideAccess: true` skips access control, never that.
 * `refuseUnownedTarget` has already asked, so `resolveManagedDocIds`'
 * per-request memo (`src/plugins/access/documentManagers.ts`) is populated
 * before the first write, and a city under a brand-new state is then refused as
 * an "invalid selection" naming a row number.
 *
 * ⚠ **A fresh `context`, not a finer memo key.** That memo's own JSDoc refuses
 * a wider key, and widening it would change every access decision in the app to
 * serve this one write. Everything else travels by reference.
 *
 * ⚠ **One per step, not per write.** Each copy re-resolves the subtree. A
 * region create needs its own, since its parent was created just before it; a
 * whole row chunk shares one, since every region it files into exists by then.
 *
 * ⚠ **The deferral rides this same copy.** One request purging per write beside
 * one that does not is the bug this prevents, and `finishCommit` pays it back.
 */

import type { PayloadRequest } from 'payload'

import { DEFER_CACHE_INVALIDATION } from '@/plugins/cache/defer'
import { SKIP_INVITATIONS } from '@/plugins/login'

/**
 * ⚠ **`inviteCoordinators: false` keeps the import from mailing anyone.** Naming
 * a class's `manager` queues that manager an invitation
 * (`queueOnManagerField`), so without the flag every address in a volunteer's
 * CSV was emailed a sign-in link ten minutes after the commit — strangers and
 * typos included. The reviewer opts in per batch (`endpoints/choices.ts`).
 */
export function commitWriteReq(
  req: PayloadRequest,
  { inviteCoordinators = false }: { inviteCoordinators?: boolean } = {},
): PayloadRequest {
  return {
    ...req,
    context: { [DEFER_CACHE_INVALIDATION]: true, [SKIP_INVITATIONS]: !inviteCoordinators },
  } as PayloadRequest
}
