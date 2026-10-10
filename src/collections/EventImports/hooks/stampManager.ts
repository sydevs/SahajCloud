import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

/**
 * Stamps the creating manager onto `manager`, which is this collection's whole
 * access story (see `EventImports.ts`).
 *
 * ⚠ **A client may not create a batch, whatever its role says.** The field
 * relates to `managers`, so an API client's id would point at somebody else's
 * manager row — and that manager would then read a CSV they never uploaded.
 * Refused here rather than filtered, because there is no sound value to write.
 */
export const stampManager: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation !== 'create') return data

  if (req.user?.collection !== 'managers') {
    throw new ValidationError({
      errors: [{ path: 'manager', message: 'Only a signed-in manager can start an import.' }],
    })
  }

  return { ...data, manager: req.user.id }
}
