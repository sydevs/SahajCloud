/**
 * When a discarded batch's retention window starts — the server's clock, never
 * the caller's.
 */

import type { CollectionBeforeChangeHook } from 'payload'

import { isAdminManager } from '@/plugins/access'

/**
 * Stamp a manager's discard with the time it actually happened.
 *
 * ⚠ **Without this the uploader picks when their own batch is erased.**
 * `batchDiscardAccess` grants the trash attempt on any non-null `deletedAt`, and
 * `deletedAt` is Payload's own auto-added column — a bare `date` with no
 * validator and no field access. So a `PATCH` carrying a date a week in the past
 * is a valid discard that `PurgeEventImports` finds already past its cutoff, and
 * the CSV is hard-deleted on the next nightly run. That hands a volunteer the
 * erasure `batchDiscardAccess` deliberately withholds, one day later and by
 * another route.
 *
 * ⚠ **A write with no manager behind it keeps its value**, which is what lets the
 * sweep's own fixtures place a batch inside or outside the window. The only
 * caller this has to constrain is a manager's request: an API client and an
 * anonymous caller are refused `update` outright (`access.ts`), so a non-admin
 * manager is the one writer that reaches here with a date of their choosing.
 */
export const stampDiscardTime: CollectionBeforeChangeHook = ({ data, req }) => {
  if (data?.deletedAt == null) return data
  if (req.user?.collection !== 'managers' || isAdminManager(req.user)) return data
  return { ...data, deletedAt: new Date().toISOString() }
}
