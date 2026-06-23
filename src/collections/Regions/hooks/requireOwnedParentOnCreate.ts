import type { CollectionBeforeValidateHook } from 'payload'

import { APIError } from 'payload'

/**
 * Atlas managers may only create regions inside their owned subtree — i.e. as a
 * child of a region they own. The access grant (`regionSubtreeAccess`) already
 * validates a chosen `parent` against that subtree, but the create-capability
 * check can't tell "opening the create form" (no parent yet) from a rootless
 * submit, so it has to allow the parentless case. This hook closes that gap: it
 * runs only on real writes (never during permission/capability checks), so it
 * can reject a parentless create outright.
 *
 * Only admins (who legitimately create countries) and atlas-managers ever reach
 * a regions `create`: every other role is denied `regions: create` by access,
 * and the document-manager fallback grants read/update only. So a non-admin
 * manager here is necessarily the subtree-scoped atlas-manager; admins pass
 * through untouched.
 */
export const requireOwnedParentOnCreate: CollectionBeforeValidateHook = ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data
  const user = req.user
  const isScopedManager =
    user?.collection === 'managers' && (user as { type?: string }).type === 'manager'
  if (isScopedManager && !data?.parent) {
    throw new APIError(
      'You can only create regions inside your own area — choose a parent region.',
      403,
    )
  }
  return data
}
