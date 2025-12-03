/**
 * Router Storage Adapter for PayloadCMS
 *
 * Routes files to different storage adapters based on MIME type.
 * Used for collections with mixed media types (e.g., Frames with images and videos).
 */
import type { Adapter, GeneratedAdapter } from '@payloadcms/plugin-cloud-storage/types'

import { logger } from '@/lib/logger'

export interface RouterConfig {
  routes: {
    [mimeTypePrefix: string]: Adapter
  }
  default: Adapter
}

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
        logger.debug('No MIME type provided, using default adapter')
        return adapters.default
      }

      for (const [mimePrefix, adapter] of Object.entries(adapters)) {
        if (mimePrefix !== 'default' && mimeType.startsWith(mimePrefix)) {
          logger.debug(`Routing ${mimeType} to ${mimePrefix} adapter`)
          return adapter
        }
      }

      logger.debug(`No matching adapter for ${mimeType}, using default`)
      return adapters.default
    }

    return {
      name: 'router-adapter',

      handleUpload: async (args) => {
        const adapter = selectAdapter(args.file.mimeType)
        logger.info(`Routing upload to ${adapter.name} adapter`)
        return adapter.handleUpload(args)
      },

      handleDelete: async (args) => {
        const adapter = selectAdapter(args.doc.mimeType)
        logger.info(`Routing delete to ${adapter.name} adapter`)
        return adapter.handleDelete(args)
      },

      staticHandler: async (req, args) => {
        const adapter = selectAdapter(args.doc?.mimeType)
        logger.debug(`Routing static request to ${adapter.name} adapter`)
        return adapter.staticHandler(req, args)
      },
    }
  }
}
