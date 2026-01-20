/**
 * Usage Plugin Tasks
 *
 * Task factories for usage tracking and reset jobs.
 */

import type { ConsumerConfig, TrackUsageInput } from './types'
import type { TaskConfig } from 'payload'

// ============================================================================
// TRACK USAGE TASK
// ============================================================================

/**
 * Creates the trackUsage task configuration.
 *
 * This task:
 * 1. Increments dailyRequests counter for the consumer
 * 2. Updates lastRequestAt timestamp
 * 3. Triggers high usage alert if threshold exceeded (logged to Pino)
 *
 * @param consumers - Consumer configurations
 * @returns TaskConfig for trackUsage
 */
// Note: Cast return type since plugin-registered tasks aren't in generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTrackUsageTask(consumers: ConsumerConfig[]): TaskConfig<any> {
  // Create lookup map for stats field paths and thresholds
  const configMap = Object.fromEntries(consumers.map((c) => [c.collection, c]))

  return {
    retries: 3,
    slug: 'trackUsage',
    inputSchema: [
      { name: 'consumerId', type: 'text', required: true },
      { name: 'consumerCollection', type: 'text', required: true },
    ],
    handler: async ({ input, req }) => {
      const { consumerId, consumerCollection } = input as TrackUsageInput
      const config = configMap[consumerCollection]

      if (!config) {
        req.payload.logger.warn({
          msg: 'Unknown consumer collection for usage tracking',
          consumerCollection,
        })
        return { output: null }
      }

      const statsFieldPath = config.statsFieldPath || 'usage'

      const consumer = await req.payload.findByID({
        collection: consumerCollection,
        id: consumerId,
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentStats = (consumer as any)?.[statsFieldPath] || {}
      const newDailyRequests = (currentStats.dailyRequests || 0) + 1

      await req.payload.update({
        collection: consumerCollection,
        id: consumerId,
        data: {
          [statsFieldPath]: {
            lastRequestAt: new Date().toISOString(),
            dailyRequests: newDailyRequests,
            peakDailyRequests: currentStats.peakDailyRequests || 0,
          },
        },
      })

      // Check high usage alert (after increment)
      if (newDailyRequests > config.highUsageThreshold) {
        req.payload.logger.warn({
          msg: 'High usage alert',
          collection: consumerCollection,
          consumerId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          consumerName: (consumer as any)?.name || 'Unknown',
          dailyRequests: newDailyRequests,
          threshold: config.highUsageThreshold,
        })
      }

      return { output: null }
    },
  }
}

// ============================================================================
// RESET USAGE TASK
// ============================================================================

/**
 * Creates the resetUsage task configuration.
 *
 * This task:
 * 1. Runs at midnight UTC daily
 * 2. Finds all consumers with dailyRequests > 0
 * 3. Updates peakDailyRequests if current dailyRequests is higher
 * 4. Resets dailyRequests to 0
 *
 * @param consumers - Consumer configurations
 * @returns TaskConfig for resetUsage
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createResetUsageTask(consumers: ConsumerConfig[]): TaskConfig<any> {
  return {
    retries: 2,
    label: 'Reset Usage Counters',
    slug: 'resetUsage',
    inputSchema: [],
    outputSchema: [],
    schedule: [
      {
        cron: '0 0 * * *', // Every day at midnight UTC
        queue: 'nightly',
      },
    ],
    handler: async ({ req }) => {
      for (const config of consumers) {
        const statsFieldPath = config.statsFieldPath || 'usage'

        // Find consumers with usage > 0
        const consumersWithUsage = await req.payload.find({
          collection: config.collection,
          where: {
            [`${statsFieldPath}.dailyRequests`]: {
              greater_than: 0,
            },
          },
          limit: 1000, // Process up to 1000 consumers per collection
        })

        for (const consumer of consumersWithUsage.docs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const stats = (consumer as any)[statsFieldPath] || {}
          const dailyRequests = stats.dailyRequests || 0
          const peakDailyRequests = stats.peakDailyRequests || 0

          await req.payload.update({
            collection: config.collection,
            id: consumer.id,
            data: {
              [statsFieldPath]: {
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
}
