import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Config } from 'payload'

import { CACHEABLE_SLUGS } from './policy'
import { purgeCloudflareCache } from './purge'

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
 *   `cachePurge` plugin), best-effort Cloudflare purge for the collections that
 *   back the cached reads.
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
  }
}

export { publicReadCacheHeaders } from './cacheHeaders'
