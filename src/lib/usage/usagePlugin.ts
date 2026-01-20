/**
 * Usage Plugin for PayloadCMS
 *
 * Main plugin orchestration that applies rate limiting and usage tracking
 * to all collections automatically.
 *
 * This plugin:
 * 1. Auto-applies beforeOperation hooks for rate limiting
 * 2. Auto-applies afterRead hooks for usage tracking
 * 3. Auto-applies beforeChange hooks for consumer collections (init stats)
 * 4. Auto-registers trackUsage and resetUsage tasks
 */

import type { UsagePluginOptions } from './types'
import type { CollectionSlug, Config } from 'payload'

import { createInitStatsHook, createRateLimitHook, createUsageTrackingHook } from './hooks'
import { createResetUsageTask, createTrackUsageTask } from './tasks'
import { SYSTEM_EXCLUSIONS } from './types'

// ============================================================================
// MAIN PLUGIN EXPORT
// ============================================================================

/**
 * Usage Plugin for PayloadCMS
 *
 * Automatically applies rate limiting and usage tracking to all collections.
 *
 * @param options - Plugin configuration
 * @returns PayloadCMS plugin
 *
 * @example
 * ```typescript
 * plugins: [
 *   usagePlugin({
 *     consumers: [{
 *       collection: 'clients',
 *       statsFieldPath: 'usage',
 *       highUsageThreshold: 1000,
 *     }],
 *     exclude: ['custom-excluded'],
 *   }),
 * ]
 * ```
 */
export function usagePlugin(options: UsagePluginOptions): (config: Config) => Config {
  const { enabled = true, consumers, exclude = [] } = options

  // If disabled, return no-op
  if (!enabled) {
    return (config: Config) => config
  }

  // Build exclusion set
  const consumerSlugs = consumers.map((c) => c.collection)
  const exclusions = new Set<CollectionSlug>([
    ...SYSTEM_EXCLUSIONS,
    ...consumerSlugs, // Consumer collections are excluded from tracking hooks
    ...exclude,
  ])

  // Create shared hooks
  const rateLimitHook = createRateLimitHook(consumers)
  const usageTrackingHook = createUsageTrackingHook(consumers)

  // Create consumer-specific hooks
  const consumerInitHooks = Object.fromEntries(
    consumers.map((config) => [config.collection, createInitStatsHook(config)]),
  )

  return (config: Config): Config => {
    return {
      ...config,

      // Apply hooks to collections
      collections: config.collections?.map((collection) => {
        const slug = collection.slug as CollectionSlug
        const isConsumer = consumerSlugs.includes(slug)
        const isExcluded = exclusions.has(slug)

        // Consumer collections get init stats hook only
        if (isConsumer) {
          const initHook = consumerInitHooks[slug]
          return {
            ...collection,
            hooks: {
              ...collection.hooks,
              beforeChange: [...(collection.hooks?.beforeChange || []), initHook],
            },
          }
        }

        // Non-excluded collections get rate limiting and tracking hooks
        if (!isExcluded) {
          return {
            ...collection,
            hooks: {
              ...collection.hooks,
              beforeOperation: [...(collection.hooks?.beforeOperation || []), rateLimitHook],
              afterRead: [...(collection.hooks?.afterRead || []), usageTrackingHook],
            },
          }
        }

        // Excluded collections: no changes
        return collection
      }),

      // Register tasks
      jobs: {
        ...config.jobs,
        tasks: [
          ...(config.jobs?.tasks || []),
          createTrackUsageTask(consumers),
          createResetUsageTask(consumers),
        ],
      },
    }
  }
}
