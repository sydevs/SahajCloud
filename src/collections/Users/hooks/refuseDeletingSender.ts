import type { CollectionBeforeDeleteHook } from 'payload'

import { APIError } from 'payload'

/**
 * Refuse deleting a Registrant who still has submissions.
 *
 * `user-submissions.user` is the only stored record of who sent a row, and
 * `ON DELETE SET NULL` — so a delete would make their history anonymous and
 * leave a pending registration with nobody to remind. The retention sweep is
 * the automated deleter, and it removes a Registrant only once none remain,
 * so this refuses no system writer. Delete their submissions first.
 */
export const refuseDeletingSender: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { totalDocs } = await req.payload.count({
    collection: 'user-submissions',
    where: { user: { equals: id } },
    overrideAccess: true,
    req,
  })
  if (totalDocs > 0) {
    throw new APIError(
      `This registrant still has ${totalDocs} submission${totalDocs === 1 ? '' : 's'}, which would lose their sender. Delete those first.`,
      409,
      undefined,
      true,
    )
  }
}
