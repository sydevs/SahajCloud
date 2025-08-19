import type { CollectionBeforeChangeHook, CollectionAfterChangeHook } from 'payload'

/**
 * Hook to validate client data before changes
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
    
    // Initialize usage stats on creation
    if (operation === 'create' && !data.usageStats) {
      data.usageStats = {
        totalRequests: 0,
        dailyRequests: 0,
        maxDailyRequests: 0,
        lastRequestAt: null,
      }
    }
  }
  
  return data
}

/**
 * Hook to check high usage after changes
 */
export const checkHighUsageAlert: CollectionAfterChangeHook = async ({ doc }) => {
  // Virtual field highUsageAlert will be computed based on dailyRequests
  if (doc?.usageStats?.dailyRequests > 1000) {
    // The field component will handle the visual alert
    // Log for monitoring
    console.warn(`High usage alert for client ${doc.name}: ${doc.usageStats.dailyRequests} requests today`)
  }
  
  return doc
}
