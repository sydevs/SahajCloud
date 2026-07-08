import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, Config } from 'payload'

import { purgeCloudflareCache } from './purge'

/**
 * Content collections whose writes back the public, edge-cacheable client reads
 * (related-*, for-audience, for-user, geojson, songs) and the frontend page
 * reads. A write to any of these purges its `Cache-Tag` so the edge serves fresh
 * content before the TTL lapses. Dependency edits (images / frames / narrators
 * embedded in the above) are intentionally NOT tagged — they fall back to the
 * TTL, which keeps the tag set small and the invalidation graph simple.
 */
const PURGE_COLLECTION_SLUGS = new Set<string>([
  'pages',
  'meditations',
  'lectures',
  'songs',
  'audiences',
  'app-cards',
  'events',
  'regions',
])

/**
 * Appends best-effort Cloudflare edge-cache purge hooks to the public-content
 * collections. The `Cache-Tag` is the collection slug, matching the tags emitted
 * by `publicReadCacheHeaders`. Fire-and-forget so it never adds latency to (or
 * fails) the write, and a no-op unless `CLOUDFLARE_ZONE_ID` +
 * `CLOUDFLARE_CACHE_PURGE_TOKEN` are configured (see `purgeCloudflareCache`) —
 * safe to ship ahead of the Cloudflare Cache Rule.
 */
export function cachePurgePlugin(config: Config): Config {
  return {
    ...config,
    collections: config.collections?.map((collection) => {
      if (!PURGE_COLLECTION_SLUGS.has(collection.slug)) return collection

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
