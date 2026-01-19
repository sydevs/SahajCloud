/**
 * Mixed Media Storage Adapter for PayloadCMS
 *
 * Routes files to different storage adapters based on MIME type:
 * - Images → Cloudflare Images (automatic WebP/AVIF optimization)
 * - Videos → Cloudflare Stream (transcoding, thumbnails, HLS streaming)
 * - Other → R2 Storage (PDFs, audio, generic files)
 *
 * Used for collections with mixed media types (e.g., Files, Frames).
 */
import type { Adapter, GeneratedAdapter } from '@payloadcms/plugin-cloud-storage/types'

import { getMimeCategory } from './mimeUtils'

/**
 * Configuration for mixed media adapter
 */
export interface MixedMediaAdapterConfig {
  /** Map of MIME type prefixes to storage adapters (e.g., "image/" -> imagesAdapter) */
  routes: {
    [mimeTypePrefix: string]: Adapter
  }
  /** R2 adapter used as the default fallback for unmatched MIME types (PDFs, audio, etc.) */
  r2Adapter: Adapter
}

/**
 * Create mixed media storage adapter
 *
 * Routes files to different storage adapters based on MIME type prefix matching.
 * The provided R2 adapter is used as the default fallback for any files that don't match image/* or video/*.
 *
 * @param config - Mixed media adapter configuration with routes and R2 adapter
 * @returns PayloadCMS storage adapter
 *
 * @example
 * ```ts
 * const adapter = mixedMediaAdapter({
 *   routes: {
 *     'image/': cloudflareImagesAdapter(imagesConfig),
 *     'video/': cloudflareStreamAdapter(streamConfig),
 *   },
 *   r2Adapter: r2NativeAdapter(r2Config),
 * })
 * ```
 */
export const mixedMediaAdapter = (config: MixedMediaAdapterConfig): Adapter => {
  return ({ collection, prefix }) => {
    // Generate all adapters upfront
    const adapters: Record<string, GeneratedAdapter> = {}

    for (const [key, adapter] of Object.entries(config.routes)) {
      adapters[key] = adapter({ collection, prefix })
    }

    // R2 adapter is used as the default fallback for unmatched MIME types
    const r2GeneratedAdapter = config.r2Adapter({ collection, prefix })

    // Helper to select adapter based on MIME type
    const selectAdapter = (mimeType: string | undefined): GeneratedAdapter => {
      const category = getMimeCategory(mimeType)

      // Route based on category
      if (category === 'image' && adapters['image/']) {
        return adapters['image/']
      }
      if (category === 'video' && adapters['video/']) {
        return adapters['video/']
      }

      // Fall back to R2 for 'other' category (PDFs, audio, etc.)
      return r2GeneratedAdapter
    }

    return {
      name: 'mixed-media-adapter',

      handleUpload: async (args) => {
        const adapter = selectAdapter(args.file.mimeType)
        return adapter.handleUpload(args)
      },

      handleDelete: async (args) => {
        const mimeType = (args.doc as { mimeType?: string }).mimeType
        const adapter = selectAdapter(mimeType)
        return adapter.handleDelete(args)
      },

      staticHandler: async (req, args) => {
        const mimeType = (args.doc as { mimeType?: string } | undefined)?.mimeType
        const adapter = selectAdapter(mimeType)
        return adapter.staticHandler(req, args)
      },
    }
  }
}
