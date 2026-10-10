/**
 * The request every commit write goes through: a subtree answer that postdates
 * what this commit just created, and cache invalidation deferred to the end.
 *
 * ⚠ **A warm memo refuses the regions this commit creates.** `Events.region`
 * and `Regions.parent` narrow through `ownedRegionFilterOptions`, and Payload's
 * own relationship validator applies a `filterOptions` on every write —
 * `overrideAccess: true` skips access control, never that. Any earlier read in
 * the request that asked the same question leaves `resolveManagedDocIds`'
 * per-request memo (`src/plugins/access/documentManagers.ts`) populated, and a
 * city under a brand-new state is then refused as an "invalid selection"
 * naming a row number.
 *
 * ⚠ **A fresh `context`, not a finer memo key.** That memo's own JSDoc refuses
 * a wider key, and widening it would change every access decision in the app to
 * serve this one write. Everything else travels by reference.
 *
 * ⚠ **The job itself runs with no `req.user`, where that memo resolves
 * nothing** — so this copy is what keeps the guarantee true for a commit fired
 * some other way, and for every nested read a write of its own sets off.
 *
 * ⚠ **One per step, not per write.** Each copy re-resolves the subtree. A
 * region create needs its own, since its parent was created just before it; a
 * whole row pass shares one, since every region it files into exists by then.
 *
 * ⚠ **The deferral rides this same copy.** One request purging per write beside
 * one that does not is the bug this prevents, and the commit job pays it back
 * with one purge per tag at the end.
 */

import type { PayloadRequest } from 'payload'

import { DEFER_CACHE_INVALIDATION } from '@/plugins/cache/defer'

export function commitWriteReq(req: PayloadRequest): PayloadRequest {
  return { ...req, context: { [DEFER_CACHE_INVALIDATION]: true } } as PayloadRequest
}
