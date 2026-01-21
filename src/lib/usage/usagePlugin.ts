/**
 * Usage Plugin for PayloadCMS
 *
 * Automatically applies rate limiting and usage tracking to all collections.
 *
 * - beforeOperation: Rate limiting via Cloudflare Workers binding
 * - afterRead: Usage tracking via job queue
 */

import type { UsagePluginOptions } from './types'
import type { CollectionSlug, Config } from 'payload'

import { createRateLimitHook, createUsageTrackingHook } from './hooks'
import { resetUsageTask, trackUsageTask } from './tasks'
import { CONSUMER_COLLECTIONS, SYSTEM_EXCLUSIONS } from './types'

/**
 * Usage Plugin for PayloadCMS
 *
 * @example
 * ```typescript
 * plugins: [
 *   usagePlugin({ enabled: true }),
 * ]
 * ```
 */
export function usagePlugin(options: UsagePluginOptions = {}): (config: Config) => Config {
  const { enabled = true, exclude = [] } = options

  if (!enabled) {
    return (config: Config) => config
  }

  // Build exclusion set
  const exclusions = new Set<CollectionSlug>([
    ...SYSTEM_EXCLUSIONS,
    ...CONSUMER_COLLECTIONS,
    ...exclude,
  ])

  // Create hooks once
  const rateLimitHook = createRateLimitHook()
  const usageTrackingHook = createUsageTrackingHook()

  return (config: Config): Config => ({
    ...config,

    collections: config.collections?.map((collection) => {
      if (exclusions.has(collection.slug as CollectionSlug)) {
        return collection
      }

      return {
        ...collection,
        hooks: {
          ...collection.hooks,
          beforeOperation: [...(collection.hooks?.beforeOperation || []), rateLimitHook],
          afterRead: [...(collection.hooks?.afterRead || []), usageTrackingHook],
        },
      }
    }),

    jobs: {
      ...config.jobs,
      tasks: [...(config.jobs?.tasks || []), trackUsageTask, resetUsageTask],
    },
  })
}
