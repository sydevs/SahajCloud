/**
 * Cloudflare-native storage configuration for Payload CMS
 *
 * Uses Cloudflare Images for image storage, Cloudflare Stream for video storage,
 * and R2 native bindings for audio files and generic files.
 *
 * Automatically falls back to local file storage in development when
 * Cloudflare credentials are not configured.
 */
import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import type { Plugin } from 'payload'

import { cloudflareImagesAdapter } from './storage/cloudflareImagesAdapter'
import { cloudflareStreamAdapter } from './storage/cloudflareStreamAdapter'
import { r2NativeAdapter } from './storage/r2NativeAdapter'
import { routerAdapter } from './storage/routerAdapter'
import { logger } from './logger'

interface CloudflareEnv {
  R2: any // R2Bucket type from @cloudflare/workers-types
  D1: any
  [key: string]: any
}

/**
 * Create Cloudflare-native storage configuration
 *
 * @param env - Cloudflare environment bindings (from wrangler)
 * @returns PayloadCMS storage plugin
 */
export const storagePlugin = (env?: CloudflareEnv): Plugin => {
  const isProduction = process.env.NODE_ENV === 'production'

  // Check if Cloudflare services are configured
  const hasCloudflareConfig =
    Boolean(env?.R2) &&
    Boolean(process.env.CLOUDFLARE_ACCOUNT_ID) &&
    Boolean(process.env.CLOUDFLARE_IMAGES_API_TOKEN) &&
    Boolean(process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH) &&
    Boolean(process.env.CLOUDFLARE_STREAM_API_TOKEN) &&
    Boolean(process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE)

  // Only use Cloudflare services in production with valid configuration
  const useCloudflare = isProduction && hasCloudflareConfig

  if (!useCloudflare) {
    logger.info('Using local file storage (Cloudflare services not configured or not in production)')

    return cloudStoragePlugin({
      enabled: false, // Disables cloud storage, uses local file storage
      collections: {},
    })
  }

  logger.info('Using Cloudflare-native storage (Images, Stream, R2)')

  // Create storage adapters
  const imagesAdapter = cloudflareImagesAdapter({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    apiToken: process.env.CLOUDFLARE_IMAGES_API_TOKEN!,
    accountHash: process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH!,
  })

  const streamAdapter = cloudflareStreamAdapter({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    apiToken: process.env.CLOUDFLARE_STREAM_API_TOKEN!,
    customerCode: process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE!,
  })

  const r2Adapter = r2NativeAdapter({
    bucket: env!.R2,
    publicUrl: `https://${process.env.PUBLIC_ASSETS_URL}`,
  })

  // Configure storage for each collection
  return cloudStoragePlugin({
    enabled: true,
    collections: {
      // Images collection - Cloudflare Images
      images: {
        adapter: imagesAdapter,
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },

      // Frames collection - Router adapter (Images for images, Stream for videos)
      frames: {
        adapter: routerAdapter({
          routes: {
            'image/': imagesAdapter,
            'video/': streamAdapter,
          },
          default: imagesAdapter,
        }),
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },

      // Audio collections - R2 native
      meditations: {
        adapter: r2Adapter,
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },
      music: {
        adapter: r2Adapter,
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },
      lessons: {
        adapter: r2Adapter,
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },

      // Files collection - R2 native
      files: {
        adapter: r2Adapter,
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },
    },
  })
}
