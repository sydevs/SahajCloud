import type { CollectionBeforeValidateHook } from 'payload'

import { APIError } from 'payload'

import { isAdminManager } from '@/plugins/access/adminOnly'

/**
 * Refuse a non-admin manager's create whose resolved `locale` is not the one
 * they are editing in.
 *
 * `access.create` runs before the field pass, so an absent `locale` has to pass
 * there — and `duplicate` sends empty `data`, then clones the SOURCE document's
 * locale. This runs after that pass, the first point the value exists
 * (`docs/rules/access.md`, #980).
 */
export const restrictCreateToRequestLocale: CollectionBeforeValidateHook = ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data
  if (req.user?.collection !== 'managers' || isAdminManager(req.user)) return data

  const locale = data?.locale
  if (typeof locale === 'string' && locale !== req.locale) {
    throw new APIError('You can only create meditations in the language you are editing in.', 403)
  }

  return data
}
