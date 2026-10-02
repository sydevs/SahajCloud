/**
 * A request copy whose cached subtree answer predates nothing this commit wrote.
 *
 * ⚠ **The one defect a commit could not recover from, and #828 names it ahead of
 * time.** `Events.region` and `Regions.parent` both validate the chosen region
 * against `ownedRegionFilterOptions`, and Payload runs a relationship's own
 * `filterOptions` on every write — `overrideAccess: true` skips access control,
 * never that. The answer comes from `resolveManagedDocIds`, memoised on
 * `req.context` for the life of the request
 * (`src/plugins/access/documentManagers.ts`), and the memo is already populated
 * before the commit writes anything, because `refuseUnownedTarget` asks the same
 * question first. So every region this commit creates is missing from the set
 * every later write is checked against: a city under a brand-new state, and a
 * class in a brand-new city, are both refused as an "invalid selection" naming a
 * row number.
 *
 * ⚠ **A fresh `context`, not a finer memo key.** That memo's own JSDoc refuses
 * to be keyed on more, and widening it there would change every access decision
 * in the app to serve this one write. `context` is where it lives, so a copy
 * carrying its own is the narrowest thing that re-asks the question. `payload`,
 * `user`, `transactionID` and `locale` all travel by reference, so the write is
 * the caller's in every other respect.
 *
 * ⚠ **Ask for one per step, not per write.** Each copy pays the subtree
 * resolution again. A region create needs its own, because its parent is the
 * level created just before it; the whole row chunk shares one, because every
 * region it files into exists by the time the first row is written.
 */

import type { PayloadRequest } from 'payload'

export function freshScopeReq(req: PayloadRequest): PayloadRequest {
  return { ...req, context: {} } as PayloadRequest
}
