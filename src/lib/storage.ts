/**
 * Cloudflare-native storage configuration for Payload CMS
 *
 * Uses Cloudflare Images for image storage, Cloudflare Stream for video storage,
 * and a custom R2 native adapter for audio files and generic files.
 *
 * All storage adapters handle filename management internally:
 * - Cloudflare Images/Stream: Stores service-generated IDs as filenames
 * - R2: Optionally sanitizes filenames (slugify + random suffix) per collection
 *
 * Automatically falls back to local file storage in development when
 * Cloudflare credentials are not configured.
 */
import type { R2Bucket, D1Database } from '@cloudflare/workers-types'
import type { Plugin } from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'

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
    return cloudStoragePlugin({
      enabled: false, // Disables cloud storage, uses local file storage
      collections: {},
    })
  }

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

  // Create R2 adapters with collection-specific configuration
  // - meditations/music: sanitize filenames (slugify + random suffix)
  // - files: preserve original filenames
  const r2AdapterWithSanitization = r2NativeAdapter({
    bucket: env!.R2 as R2Bucket,
    publicUrl: process.env.CLOUDFLARE_R2_DELIVERY_URL || '',
    sanitizeFilenames: true,
  })

  const r2AdapterWithoutSanitization = r2NativeAdapter({
    bucket: env!.R2 as R2Bucket,
    publicUrl: process.env.CLOUDFLARE_R2_DELIVERY_URL || '',
    sanitizeFilenames: false,
  })

  // Return a single cloudStoragePlugin with all adapters configured
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

      // Tag collections with SVG icons - Cloudflare Images
      'meditation-tags': {
        adapter: imagesAdapter,
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },
      'music-tags': {
        adapter: imagesAdapter,
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },

      // Audio collections - R2 with filename sanitization
      // Sanitized filenames: "My Audio (1).mp3" -> "my-audio-1-xk2j9s.mp3"
      meditations: {
        adapter: r2AdapterWithSanitization,
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },
      music: {
        adapter: r2AdapterWithSanitization,
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },

      // Files collection - R2 without sanitization (preserve original filenames)
      files: {
        adapter: r2AdapterWithoutSanitization,
        disableLocalStorage: true,
        disablePayloadAccessControl: true,
      },
    },
  })
}
