/**
 * Usage Plugin for PayloadCMS
 *
 * Automatically applies rate limiting and usage tracking to all collections.
 *
 * - beforeOperation: Rate limiting (enforced at the Cloudflare edge; the app hook is a no-op)
 * - beforeOperation: Usage tracking via an atomic Postgres UPDATE (counts once per top-level read)
 */

import type { ClientReadGate } from './hooks'
import type { CollectionSlug, Config } from 'payload'

import { resolveLivePreviewHook } from '@/lib/utilities/previewSecret'

import { SYSTEM_EXCLUSIONS } from './constants'
import {
  onlyOnCallerAuthority,
  rateLimitHook,
  usageTrackingBeforeOperationHook,
  validateClientOriginHook,
  validateClientQueryParamsHook,
} from './hooks'
import { resetUsageTask } from './tasks'

/**
 * The four gates, in the order they must run: origin enforcement first, so a
 * disallowed origin is rejected before query-shape validation or any rate
 * accounting; usage tracking last, so it counts exactly once per top-level
 * read, skipping internal relationship-population sub-reads.
 *
 * Declared once and applied to collections and globals alike (#710) — two
 * copies of this list would let the two surfaces drift apart in order, which
 * is a security difference, not a stylistic one.
 *
 * `ClientReadGate` is the shared argument shape both of payload's hook
 * signatures satisfy, so this array registers on either surface with no cast.
 * The global surface wraps each gate in `onlyOnCallerAuthority`, the one
 * exemption a global needs — see `hooks.ts`.
 */
const BEFORE_OPERATION_HOOKS: ClientReadGate[] = [
  validateClientOriginHook,
  validateClientQueryParamsHook,
  rateLimitHook,
  usageTrackingBeforeOperationHook,
]


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
            // First: two of the gates below exempt a preview read, and the
            // access layer unlocks drafts on the same signal. Verifying the
            // token is async while those readers are sync, so the one await
            // happens here and everything downstream reads a stamped boolean.
            //
            // ⚠ **This rides on the plugin's own `enabled` flag**, which is
            // `!isE2ETest` in `payload.config.ts`. So `E2E_TEST=true` would
            // unregister the resolver, every verdict would read false, and
            // live preview would silently serve published content. Nothing
            // sets that variable today — a repo-wide search finds it only at
            // its own definition — so this is a latent coupling rather than a
            // live defect. If E2E ever does set it, the resolver needs its own
            // registration rather than a home inside a metering plugin.
            resolveLivePreviewHook,
            ...BEFORE_OPERATION_HOOKS,
          ],
        },
      }
    }),

    // Globals get the same four gates (#710). Before this, `GET
    // /api/globals/<slug>` was unmetered and outside origin enforcement —
    // and every atlas widget boot and WeMeditateWeb request reads one.
    // `exclusions` names collections only, and no global is a Payload system
    // collection, so every global is wrapped.
    globals: config.globals?.map((global) => ({
      ...global,
      hooks: {
        ...global.hooks,
        beforeOperation: [
          ...(global.hooks?.beforeOperation || []),
          // ⚠ Deliberately NOT wrapped in `onlyOnCallerAuthority`, unlike the
          // gates. That wrapper skips a global read made on internal authority,
          // which is right for metering and origin checks and wrong here: this
          // resolves a fact about the request, and an unresolved verdict reads
          // as "no preview".
          resolveLivePreviewHook,
          ...BEFORE_OPERATION_HOOKS.map(onlyOnCallerAuthority),
        ],
      },
    })),

    jobs: {
      ...config.jobs,
      tasks: [...(config.jobs?.tasks || []), resetUsageTask],
    },
  })
}
