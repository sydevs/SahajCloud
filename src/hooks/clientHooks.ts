import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Hook to validate client data before changes
 *
 * Ensures primary contact is included in managers list.
 * Usage stats initialization is handled by the usagePlugin.
 */
export const validateClientData: CollectionBeforeChangeHook = async ({ data, operation }) => {
  if (operation === 'create' || operation === 'update') {
    // Ensure primary contact is in managers list
    if (data?.primaryContact && data?.managers) {
      const managersArray = Array.isArray(data.managers) ? data.managers : [data.managers]
      if (!managersArray.includes(data.primaryContact)) {
        data.managers = [...managersArray, data.primaryContact]
      }
    }
  }

  return data
}
