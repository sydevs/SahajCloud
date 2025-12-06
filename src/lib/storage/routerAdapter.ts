/**
 * Router Storage Adapter for PayloadCMS
 *
 * Routes files to different storage adapters based on MIME type.
 * Used for collections with mixed media types (e.g., Frames with images and videos).
 */
import type { Adapter, GeneratedAdapter } from '@payloadcms/plugin-cloud-storage/types'

/**
 * Configuration for router adapter
 */
export interface RouterConfig {
  /** Map of MIME type prefixes to storage adapters (e.g., "image/" -> imagesAdapter) */
  routes: {
    [mimeTypePrefix: string]: Adapter
  }
  /** Default adapter for unmatched MIME types */
  default: Adapter
}

/**
 * Create router storage adapter
 *
 * Routes files to different storage adapters based on MIME type prefix matching.
 * Useful for collections with mixed media types (e.g., images and videos).
 *
 * @param config - Router configuration with MIME type routes
 * @returns PayloadCMS storage adapter
 *
 * @example
 * ```ts
 * const adapter = routerAdapter({
 *   routes: {
 *     'image/': cloudflareImagesAdapter(imagesConfig),
 *     'video/': cloudflareStreamAdapter(streamConfig),
 *   },
 *   default: cloudflareImagesAdapter(imagesConfig),
 * })
 * ```
 */
export const routerAdapter = (config: RouterConfig): Adapter => {
  return ({ collection, prefix }) => {
    // Generate all adapters upfront
    const adapters: Record<string, GeneratedAdapter> = {}

    for (const [key, adapter] of Object.entries(config.routes)) {
      adapters[key] = adapter({ collection, prefix })
    }
    adapters.default = config.default({ collection, prefix })

    // Helper to select adapter based on MIME type
    const selectAdapter = (mimeType: string | undefined): GeneratedAdapter => {
      if (!mimeType) {
        return adapters.default
      }

      for (const [mimePrefix, adapter] of Object.entries(adapters)) {
        if (mimePrefix !== 'default' && mimeType.startsWith(mimePrefix)) {
          return adapter
        }
      }

      return adapters.default
    }

    return {
      name: 'router-adapter',

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
