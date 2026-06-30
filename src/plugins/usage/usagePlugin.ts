/**
 * Usage Plugin for PayloadCMS
 *
 * Automatically applies rate limiting and usage tracking to all collections.
 *
 * - beforeOperation: Rate limiting (enforced at the Cloudflare edge; the app hook is a no-op)
 * - afterRead: Usage tracking via an atomic Postgres UPDATE
 */

import type { CollectionSlug, Config } from 'payload'

import { SYSTEM_EXCLUSIONS } from './constants'
import {
  rateLimitHook,
  usageTrackingHook,
  validateClientOriginHook,
  validateClientQueryParamsHook,
} from './hooks'
import { resetUsageTask } from './tasks'

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
export function usagePlugin(
  options: { enabled?: boolean; exclude?: CollectionSlug[] } = {},
): (config: Config) => Config {
  const { enabled = true, exclude = [] } = options

  if (!enabled) {
    return (config: Config) => config
  }

  // Build exclusion set
  const exclusions = new Set<CollectionSlug>([...SYSTEM_EXCLUSIONS, 'clients', ...exclude])

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
          beforeOperation: [
            ...(collection.hooks?.beforeOperation || []),
            // Origin enforcement runs first — a disallowed origin is rejected
            // before query-shape validation or any rate accounting.
            validateClientOriginHook,
            validateClientQueryParamsHook,
            rateLimitHook,
          ],
          afterRead: [...(collection.hooks?.afterRead || []), usageTrackingHook],
        },
      }
    }),

    jobs: {
      ...config.jobs,
      tasks: [...(config.jobs?.tasks || []), resetUsageTask],
    },
  })
}
