/**
 * Usage Plugin Tasks
 *
 * Task configurations for usage tracking and daily reset.
 */

import type { TrackUsageInput } from './types'
import type { TaskConfig } from 'payload'

import {
  CONSUMER_COLLECTIONS,
  HIGH_USAGE_THRESHOLD,
  STATS_FIELD_PATH,
} from './types'

// ============================================================================
// TRACK USAGE TASK
// ============================================================================

/**
 * Task that increments daily request counter for a consumer.
 *
 * Triggered by afterRead hook on each API request.
 * Also logs high usage alerts when threshold is exceeded.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trackUsageTask: TaskConfig<any> = {
  slug: 'trackUsage',
  retries: 3,
  inputSchema: [{ name: 'consumerId', type: 'text', required: true }],
  handler: async ({ input, req }) => {
    const { consumerId } = input as TrackUsageInput

    // Currently only 'clients' collection is supported
    const collection = CONSUMER_COLLECTIONS[0]

    const consumer = await req.payload.findByID({
      collection,
      id: consumerId,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = (consumer as any)?.[STATS_FIELD_PATH] || {}
    const newDailyRequests = (stats.dailyRequests || 0) + 1

    await req.payload.update({
      collection,
      id: consumerId,
      data: {
        [STATS_FIELD_PATH]: {
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
        consumerId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        consumerName: (consumer as any)?.name || 'Unknown',
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
 * - Only processes consumers with dailyRequests > 0
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const resetUsageTask: TaskConfig<any> = {
  slug: 'resetUsage',
  label: 'Reset Usage Counters',
  retries: 2,
  inputSchema: [],
  outputSchema: [],
  schedule: [{ cron: '0 0 * * *', queue: 'nightly' }],
  handler: async ({ req }) => {
    for (const collection of CONSUMER_COLLECTIONS) {
      const consumersWithUsage = await req.payload.find({
        collection,
        where: { [`${STATS_FIELD_PATH}.dailyRequests`]: { greater_than: 0 } },
        limit: 1000,
      })

      for (const consumer of consumersWithUsage.docs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stats = (consumer as any)[STATS_FIELD_PATH] || {}
        const dailyRequests = stats.dailyRequests || 0
        const peakDailyRequests = stats.peakDailyRequests || 0

        await req.payload.update({
          collection,
          id: consumer.id,
          data: {
            [STATS_FIELD_PATH]: {
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
