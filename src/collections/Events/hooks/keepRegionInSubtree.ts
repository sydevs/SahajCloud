import type { CollectionBeforeValidateHook } from 'payload'

import { APIError } from 'payload'

import { isManager, resolveOwnedRegionIds } from '@/plugins/access'
import { relationId } from '@/plugins/access/documentManagers'

/**
 * Refuses a non-admin manager's write that would store an event outside their
 * owned-region subtree, judged on the region the write is about to store.
 *
 * Access cannot judge that for two writers, because neither shows it the
 * region. `restoreVersion` runs update access with `{ _status }` alone and then
 * writes the old version's region. A proposal accept creates the event with
 * `overrideAccess: true` at the region the reviewer left on the submission.
 * This hook sees both: it runs after the field pass, with the version's data or
 * the created row's, and with the reviewer's `req` on an accept.
 *
 * A region equal to the stored one is no move, so an event assignee, who owns
 * no region, still saves their own event. Admins and system writes with no
 * manager on `req` are not checked.
 */
export const keepRegionInSubtree: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!isManager(req.user)) return data
  if (operation !== 'create' && operation !== 'update') return data
  const regionId = relationId(data?.region)
  if (operation === 'update' && regionId === relationId(originalDoc?.region)) return data
  const owned = await resolveOwnedRegionIds(req, Number(req.user.id))
  if (regionId !== null && owned.includes(regionId)) return data
  throw new APIError('You can only place an event in a city or venue inside your own area.', 403)
}
