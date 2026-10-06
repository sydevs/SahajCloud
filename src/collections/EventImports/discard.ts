/**
 * What a manager's own `PATCH` of a batch may change: when it was discarded, and
 * nothing it did not choose.
 */

import type { CollectionBeforeChangeHook } from 'payload'

import { APIError } from 'payload'

import { isAdminManager } from '@/plugins/access'

/**
 * The `context` key an import endpoint's own write carries, which this hook
 * leaves alone: the finish trashes a committing batch as its report, under the
 * uploader's request. `context` is server-side state no `PATCH` can set.
 */
export const ENDPOINT_WRITE = 'eventImportEndpointWrite'

/**
 * Hold a manager's update of their own batch to what a discard is.
 *
 * ⚠ **The discard's timestamp is the server's clock, never the caller's.**
 * `batchDiscardAccess` grants the trash attempt on any non-null `deletedAt`, and
 * `deletedAt` is Payload's own auto-added column — a bare `date` with no
 * validator and no field access. So a `PATCH` carrying a date a week in the past
 * is a valid discard that `PurgeEventImports` finds already past its cutoff, and
 * the CSV is hard-deleted on the next nightly run. That hands a volunteer the
 * erasure `batchDiscardAccess` deliberately withholds, one day later and by
 * another route.
 *
 * ⚠ **A batch part-way through its commit cannot be discarded.** Classes it
 * already created are live, and the finish — the cache purge, the report — has
 * not run; trashing it would strand both with no record of which classes came
 * from it. Resuming is what finishes it, and an abandoned one is finished by the
 * sweep (`PurgeEventImports`).
 *
 * ⚠ **`createdAt` is dropped.** Payload's timestamps carry no field access, and
 * the finish counts the coordinator accounts a batch opened against it.
 *
 * ⚠ **A write with no manager behind it keeps its value**, which is what lets the
 * sweep's own fixtures place a batch inside or outside the window. The only
 * caller this has to constrain is a manager's request: an API client and an
 * anonymous caller are refused `update` outright (`access.ts`), so a non-admin
 * manager is the one writer that reaches here with values of their choosing.
 */
export const guardBatchUpdate: CollectionBeforeChangeHook = ({
  context,
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || context?.[ENDPOINT_WRITE] === true) return data
  if (req.user?.collection !== 'managers' || isAdminManager(req.user)) return data

  const { createdAt: _ignored, ...kept } = data ?? {}
  if (kept.deletedAt == null) return kept

  if (originalDoc?.status === 'committing') {
    throw new APIError(
      'This batch is part-way through its commit, so it cannot be discarded. Resume it to finish.',
      409,
      undefined,
      true,
    )
  }
  return { ...kept, deletedAt: new Date().toISOString() }
}
