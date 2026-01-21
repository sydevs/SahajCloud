/**
 * Usage Plugin Tasks
 *
 * Task configurations for usage tracking and daily reset.
 */

import type { ApiConsumerWithStats } from './types'
import type { TaskConfig } from 'payload'

import { API_CONSUMER_COLLECTIONS, HIGH_USAGE_THRESHOLD } from './types'

// ============================================================================
// TRACK USAGE TASK
// ============================================================================

/**
 * Task that increments daily request counter for an API consumer.
 *
 * Triggered by afterRead hook on each API request.
 * Also logs high usage alerts when threshold is exceeded.
 */
export const trackUsageTask: TaskConfig<'trackUsage'> = {
  slug: 'trackUsage',
  retries: 3,
  inputSchema: [{ name: 'apiConsumerId', type: 'text', required: true }],
  handler: async ({ input, req }) => {
    const { apiConsumerId } = input

    // Currently only 'clients' collection is supported
    const collection = API_CONSUMER_COLLECTIONS[0]

    const apiConsumer = (await req.payload.findByID({
      collection,
      id: apiConsumerId,
    })) as ApiConsumerWithStats

    const stats = apiConsumer?.usage || {}
    const newDailyRequests = (stats.dailyRequests || 0) + 1

    await req.payload.update({
      collection,
      id: apiConsumerId,
      data: {
        usage: {
          dailyRequests: newDailyRequests,
          peakDailyRequests: stats.peakDailyRequests || 0,
          lastRequestAt: new Date().toISOString(),
        },
      },
    })

    // Log high usage alert
    if (newDailyRequests > HIGH_USAGE_THRESHOLD) {
      req.payload.logger.warn({
        msg: 'High usage alert',
        collection,
        apiConsumerId,
        apiConsumerName: apiConsumer?.name || 'Unknown',
        dailyRequests: newDailyRequests,
        threshold: HIGH_USAGE_THRESHOLD,
      })
    }

    return { output: null }
  },
}

// ============================================================================
// RESET USAGE TASK
// ============================================================================

/**
 * Task that resets daily counters at midnight UTC.
 *
 * - Updates peakDailyRequests if current is higher
 * - Resets dailyRequests to 0
 * - Only processes API consumers with dailyRequests > 0
 */
export const resetUsageTask: TaskConfig<'resetUsage'> = {
  slug: 'resetUsage',
  label: 'Reset Usage Counters',
  retries: 2,
  inputSchema: [],
  outputSchema: [],
  schedule: [{ cron: '0 0 * * *', queue: 'nightly' }],
  handler: async ({ req }) => {
    for (const collection of API_CONSUMER_COLLECTIONS) {
      const apiConsumersWithUsage = await req.payload.find({
        collection,
        where: { 'usage.dailyRequests': { greater_than: 0 } },
        limit: 1000,
      })

      for (const doc of apiConsumersWithUsage.docs) {
        const apiConsumer = doc as ApiConsumerWithStats
        const stats = apiConsumer.usage || {}
        const dailyRequests = stats.dailyRequests || 0
        const peakDailyRequests = stats.peakDailyRequests || 0

        await req.payload.update({
          collection,
          id: apiConsumer.id,
          data: {
            usage: {
              ...stats,
              peakDailyRequests: Math.max(peakDailyRequests, dailyRequests),
              dailyRequests: 0,
            },
          },
        })
      }
    }

    return { output: null }
  },
}
