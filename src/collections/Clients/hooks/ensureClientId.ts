import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Auto-issues a UUID `clientId` for manually-created services.
 *
 * Fires on `create` only, and only when `clientId` is empty — editing never
 * overwrites an existing id. Atlas-imported services arrive with an
 * externally-supplied `clientId` (the importer sets it explicitly), so this
 * hook is a no-op for them.
 */
export const ensureClientId: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation === 'create' && !data.clientId) {
    data.clientId = crypto.randomUUID()
  }
  return data
}
