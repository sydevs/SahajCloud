import type { CollectionBeforeValidateHook } from 'payload'

import { APIError } from 'payload'

import { isAdminManager } from '@/plugins/access/adminOnly'

/**
 * Refuse a non-admin manager's create whose resolved `locale` is not the one
 * their role was read in.
 *
 * `scopeMeditationWrite` (`src/plugins/access/accessConfigs.ts`) already answers
 * this for a create that *states* a language. It cannot answer for one that does
 * not: `access.create` runs before the field pass that fills the value, so an
 * absent `locale` has to be allowed there — and `duplicate` sends an empty
 * `data` and then clones the SOURCE document's locale rather than taking the
 * default (`getFallbackValue` prefers `siblingDoc` over `defaultValue`). So a
 * French editor could `POST /api/meditations/<english id>/duplicate` and land a
 * new English meditation in the app's English catalogue, editable by nobody but
 * an admin.
 *
 * This runs after the field pass, which is the first point the language is
 * known — the same reason `restrictUploadToAdmin` guards `req.file` in a hook
 * rather than through field access. One rule each, for the two moments the
 * value can arrive, rather than two copies of one rule.
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
