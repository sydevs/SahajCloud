import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  Config,
  GlobalAfterChangeHook,
} from 'payload'

import { CACHEABLE_GLOBALS, CACHEABLE_SLUGS } from './policy'
import { purgeCloudflareCache } from './purge'
import { CONSUMER_CACHED_GLOBALS, revalidateConsumerCaches } from './revalidateConsumers'

/**
 * `cachePlugin` — one cohesive edge-cache module for the public client-read
 * surface (#555). It owns three concerns:
 *
 * - **Policy** (`./policy`) — the single source of truth for which reads are
 *   cacheable, their per-collection TTLs, `Cache-Tag`s, and the shared header
 *   builder. Edge-safe (dependency-free).
 * - **Read-header application** across both surfaces, sharing that policy:
 *   - built-in REST reads (`GET /api/<collection>`) via the Next.js middleware
 *     (`./middleware`, wired through `src/middleware.ts`) — the generated
 *     `REST_GET` route stays thin;
 *   - the 9 custom endpoints via the in-handler `publicReadCacheHeaders`
 *     decorator (`./cacheHeaders`).
 * - **Purge-on-write** — the Payload plugin below (folded in from the former
 *   `cachePurge` plugin), best-effort Cloudflare purge for the collections and
 *   globals that back the cached reads, plus a consumer-side revalidation for
 *   the one consumer that keeps its own copy (`./revalidateConsumers`).
 *
 * NB: response-header emission for built-in reads lives in Next.js middleware,
 * not in this Payload plugin — Payload plugins can't hook HTTP response headers
 * on the built-in REST routes. This function only attaches the write-time purge
 * hooks; the middleware is registered separately at `src/middleware.ts`.
 */
export function cachePlugin(config: Config): Config {
  return {
    ...config,
    collections: config.collections?.map((collection) => {
      if (!CACHEABLE_SLUGS.has(collection.slug)) return collection

      const tag = collection.slug
      const afterChange: CollectionAfterChangeHook = ({ doc, req }) => {
        void purgeCloudflareCache({ tags: [tag] }, { logger: req.payload.logger })
        return doc
      }
      const afterDelete: CollectionAfterDeleteHook = ({ doc, req }) => {
        void purgeCloudflareCache({ tags: [tag] }, { logger: req.payload.logger })
        return doc
      }

      return {
        ...collection,
        hooks: {
          ...collection.hooks,
          afterChange: [...(collection.hooks?.afterChange ?? []), afterChange],
          afterDelete: [...(collection.hooks?.afterDelete ?? []), afterDelete],
        },
      }
    }),

    globals: config.globals?.map((global) => {
      const isCacheable = CACHEABLE_GLOBALS.has(global.slug)
      const isConsumerCached = CONSUMER_CACHED_GLOBALS.has(global.slug)
      // The union, because the two invalidations answer to different sets.
      // Attaching on `CACHEABLE_GLOBALS` alone would tie a consumer's KV purge
      // to *our* edge-cacheability: dropping `wm-web-config` to DYNAMIC later
      // would silently stop WeMeditateWeb's revalidation too, which has nothing
      // to do with whether we cache the read at the edge.
      if (!isCacheable && !isConsumerCached) return global

      const tag = global.slug
      // A global has no delete, so there is no afterDelete half. `afterChange`
      // covers `publishSpecificLocale` too, which is the write that matters
      // most here: a client read is published-only and merged with English, so
      // publishing one locale changes what every client sees.
      const afterChange: GlobalAfterChangeHook = ({ doc, req }) => {
        if (isCacheable) {
          void purgeCloudflareCache({ tags: [tag] }, { logger: req.payload.logger })
        }
        if (isConsumerCached) {
          void revalidateConsumerCaches(tag, { logger: req.payload.logger })
        }
        return doc
      }

      return {
        ...global,
        hooks: {
          ...global.hooks,
          afterChange: [...(global.hooks?.afterChange ?? []), afterChange],
        },
      }
    }),
  }
}

export { publicReadCacheHeaders } from './cacheHeaders'
