import type { PayloadRequest } from 'payload'
import type { Client } from '@/payload-types'

// Simple in-memory cache for performance
const usageCache = new Map<string, { count: number; lastFlush: Date }>()

// Flush cache to database every 5 minutes or 100 requests
const FLUSH_INTERVAL = 5 * 60 * 1000 // 5 minutes
const FLUSH_THRESHOLD = 100 // requests

export async function trackAPIUsage(req: PayloadRequest): Promise<void> {
  // Only track for API key authenticated requests
  if (!req.user || req.user.collection !== 'clients') {
    return
  }

  const clientId = req.user.id
  const now = new Date()

  // Update cache
  const cached = usageCache.get(clientId) || { count: 0, lastFlush: now }
  cached.count++

  // Check if we should flush to database
  const shouldFlush =
    cached.count >= FLUSH_THRESHOLD ||
    now.getTime() - cached.lastFlush.getTime() > FLUSH_INTERVAL

  if (shouldFlush) {
    try {
      // Get current client data
      const client = await req.payload.findByID({
        collection: 'clients',
        id: clientId,
        depth: 0,
      }) as Client

      // Check if we need to reset daily counter
      const lastReset = client.apiUsage?.lastResetDate
        ? new Date(client.apiUsage.lastResetDate)
        : new Date(0)
      const isNewDay = !isSameDay(lastReset, now)

      // Update client with new usage data
      await req.payload.update({
        collection: 'clients',
        id: clientId,
        data: {
          lastUsed: now.toISOString(),
          apiUsage: {
            totalRequests: (client.apiUsage?.totalRequests || 0) + cached.count,
            dailyRequests: isNewDay ? cached.count : (client.apiUsage?.dailyRequests || 0) + cached.count,
            lastResetDate: isNewDay ? now.toISOString() : client.apiUsage?.lastResetDate,
          },
        },
      })

      // Reset cache
      usageCache.set(clientId, { count: 0, lastFlush: now })
    } catch (error) {
      console.error('Failed to update API usage:', error)
      // Don't throw - we don't want to break the API request
    }
  } else {
    usageCache.set(clientId, cached)
  }
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

// Flush all cached usage data on shutdown
export async function flushAllUsageData(payload: any): Promise<void> {
  for (const [clientId, cached] of usageCache.entries()) {
    if (cached.count > 0) {
      try {
        const client = await payload.findByID({
          collection: 'clients',
          id: clientId,
          depth: 0,
        })

        const now = new Date()
        const lastReset = client.apiUsage?.lastResetDate
          ? new Date(client.apiUsage.lastResetDate)
          : new Date(0)
        const isNewDay = !isSameDay(lastReset, now)

        await payload.update({
          collection: 'clients',
          id: clientId,
          data: {
            lastUsed: now.toISOString(),
            apiUsage: {
              totalRequests: (client.apiUsage?.totalRequests || 0) + cached.count,
              dailyRequests: isNewDay ? cached.count : (client.apiUsage?.dailyRequests || 0) + cached.count,
              lastResetDate: isNewDay ? now.toISOString() : client.apiUsage?.lastResetDate,
            },
          },
        })
      } catch (error) {
        console.error(`Failed to flush usage data for client ${clientId}:`, error)
      }
    }
  }
  usageCache.clear()
}