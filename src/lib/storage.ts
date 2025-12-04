/**
 * Cloudflare-native storage configuration for Payload CMS
 *
 * Uses Cloudflare Images for image storage, Cloudflare Stream for video storage,
 * and R2 native bindings for audio files and generic files.
 *
 * Automatically falls back to local file storage in development when
 * Cloudflare credentials are not configured.
 */
import type { R2Bucket, D1Database } from '@cloudflare/workers-types'
import type { Plugin } from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'

import { logger } from './logger'
import { cloudflareImagesAdapter } from './storage/cloudflareImagesAdapter'
import { cloudflareStreamAdapter } from './storage/cloudflareStreamAdapter'
import { r2NativeAdapter } from './storage/r2NativeAdapter'
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

  logger.info('Using Cloudflare-native storage (Images, Stream, R2)')

  // Create storage adapters
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

  const r2Adapter = r2NativeAdapter({
    bucket: env!.R2 as R2Bucket,
    publicUrl: process.env.CLOUDFLARE_R2_DELIVERY_URL || '',
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
    } as any, // Type assertion: lessons collection exists but types may not be regenerated yet
  })
}
