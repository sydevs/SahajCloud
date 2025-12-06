/**
 * Cloudflare-native storage configuration for Payload CMS
 *
 * Uses Cloudflare Images for image storage, Cloudflare Stream for video storage,
 * and official @payloadcms/storage-r2 for audio files and generic files.
 *
 * Automatically falls back to local file storage in development when
 * Cloudflare credentials are not configured.
 */
import type { R2Bucket, D1Database } from '@cloudflare/workers-types'
import type { Plugin } from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'
import { r2Storage } from '@payloadcms/storage-r2'

import { logger } from './logger'
import { cloudflareImagesAdapter } from './storage/cloudflareImagesAdapter'
import { cloudflareStreamAdapter } from './storage/cloudflareStreamAdapter'
import { routerAdapter } from './storage/routerAdapter'

interface CloudflareEnv {
  // Using R2Bucket/D1Database from @cloudflare/workers-types
  // If version conflicts occur, widen to unknown and add runtime checks
  R2: R2Bucket | unknown
  D1: D1Database | unknown
  [key: string]: unknown
}

/**
 * Create Cloudflare-native storage configuration
 *
 * @param env - Cloudflare environment bindings (from wrangler)
 * @returns PayloadCMS storage plugin
 */
export const storagePlugin = (env?: CloudflareEnv): Plugin => {
  const isProduction = process.env.NODE_ENV === 'production'

  // Debug logging
  logger.info('Storage plugin initialization', {
    isProduction,
    hasR2Binding: Boolean(env?.R2),
    hasAccountId: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
    hasApiKey: Boolean(process.env.CLOUDFLARE_API_KEY),
    hasImagesUrl: Boolean(process.env.CLOUDFLARE_IMAGES_DELIVERY_URL),
    hasStreamUrl: Boolean(process.env.CLOUDFLARE_STREAM_DELIVERY_URL),
    envKeys: env ? Object.keys(env) : [],
  })

  // Check if Cloudflare services are configured
  const hasCloudflareConfig =
    Boolean(env?.R2) &&
    Boolean(process.env.CLOUDFLARE_ACCOUNT_ID) &&
    Boolean(process.env.CLOUDFLARE_API_KEY) &&
    Boolean(process.env.CLOUDFLARE_IMAGES_DELIVERY_URL) &&
    Boolean(process.env.CLOUDFLARE_STREAM_DELIVERY_URL)

  // Only use Cloudflare services in production with valid configuration
  const useCloudflare = isProduction && hasCloudflareConfig

  if (!useCloudflare) {
    logger.info('Using local file storage (Cloudflare services not configured or not in production)')

    return cloudStoragePlugin({
      enabled: false, // Disables cloud storage, uses local file storage
      collections: {},
    })
  }

  logger.info('Using Cloudflare-native storage (Images, Stream, Official R2)')

  // Create storage adapters for Images and Stream
  const imagesAdapter = cloudflareImagesAdapter({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    apiKey: process.env.CLOUDFLARE_API_KEY!,
    deliveryUrl: process.env.CLOUDFLARE_IMAGES_DELIVERY_URL!,
  })

  const streamAdapter = cloudflareStreamAdapter({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    apiKey: process.env.CLOUDFLARE_API_KEY!,
    deliveryUrl: process.env.CLOUDFLARE_STREAM_DELIVERY_URL!,
  })

  // Return a plugin function that combines Images/Stream and official R2 storage
  return async (incomingConfig) => {
    // First apply Images/Stream adapters via cloudStoragePlugin
    let config = await Promise.resolve(
      cloudStoragePlugin({
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
        },
      })(incomingConfig),
    )

    // Then apply official R2 storage for audio/file collections
    // Type assertion needed due to version mismatch between @cloudflare/workers-types and @payloadcms/storage-r2
    // NOTE: Not using prefix option because it requires a database column (`prefix`) that doesn't exist
    // Files will be stored in the root of the R2 bucket with unique filenames
    // Note: r2Storage automatically sets disableLocalStorage, so we don't need to specify it
    // Note: lessons collection is NOT an upload collection - it uses FileAttachments
    config = await Promise.resolve(
      r2Storage({
        bucket: env!.R2 as any, // R2Bucket type compatibility
        collections: {
          meditations: true,
          music: true,
          files: true,
        } as any, // Collection slug type compatibility
      })(config),
    )

    return config
  }
}
