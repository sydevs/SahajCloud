/**
 * Cloudflare-native storage configuration for Payload CMS
 *
 * Uses Cloudflare Images for image storage, Cloudflare Stream for video storage,
 * and a custom R2 native adapter for audio files and generic files.
 *
 * All storage adapters handle filename management internally:
 * - Cloudflare Images/Stream: Stores service-generated IDs as filenames
 * - R2: Sanitizes filenames (slugify + random suffix) for all uploads
 *
 * Automatically falls back to local file storage in development when
 * Cloudflare credentials are not configured.
 */
import type { R2Bucket } from '@cloudflare/workers-types'
import type { Plugin } from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'

import { cloudflareImagesAdapter } from './cloudflareImagesAdapter'
import { cloudflareStreamAdapter } from './cloudflareStreamAdapter'
import { r2NativeAdapter } from './r2NativeAdapter'
import { routerAdapter } from './routerAdapter'

interface StoragePluginOptions {
  /**
   * Cloudflare environment bindings (from wrangler)
   * Can be any object with R2/D1 properties from CloudflareContext
   * Type is unknown - runtime validation ensures correctness
   */
  env?: unknown
  /**
   * Whether or not to enable the plugin
   * @default true
   */
  enabled?: boolean
}

/**
 * Create Cloudflare-native storage configuration
 *
 * @param options - Plugin options
 * @returns PayloadCMS storage plugin
 */
export const storagePlugin = (options: StoragePluginOptions = {}): Plugin => {
  const { env, enabled = true } = options

  return (config) => {
    // Early return if plugin is disabled - use cloudStoragePlugin for consistent behavior
    if (!enabled) {
      return cloudStoragePlugin({
        enabled: false,
        collections: {},
      })(config)
    }

    // Check if Cloudflare credentials are available
    const hasCloudflareCredentials =
      env &&
      process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CLOUDFLARE_API_KEY &&
      process.env.CLOUDFLARE_IMAGES_DELIVERY_URL &&
      process.env.CLOUDFLARE_STREAM_DELIVERY_URL

    // If no env or missing credentials, use local storage (development fallback)
    if (!hasCloudflareCredentials) {
      return cloudStoragePlugin({
        enabled: false, // Disables cloud storage, uses local file storage
        collections: {},
      })(config)
    }

    // Env and credentials provided - validate R2 bucket binding
    // Type assertion needed since env is unknown - runtime validation ensures correctness
    const envObj = env as Record<string, unknown>

    if (!envObj.R2) {
      throw new Error('storagePlugin: R2 bucket binding is required when env is provided')
    }

    // Extract R2 bucket with type narrowing (safe after validation)
    const r2Bucket = envObj.R2 as R2Bucket

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

    // Create R2 adapter for audio and file storage
    // All filenames are automatically sanitized (slugify + random suffix)
    const r2Adapter = r2NativeAdapter({
      bucket: r2Bucket,
      publicUrl: process.env.CLOUDFLARE_R2_DELIVERY_URL || '',
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

        // Albums collection - Cloudflare Images (album artwork)
        albums: {
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

        // Tag collections with SVG icons - R2 storage (Cloudflare Images doesn't support SVG)
        'meditation-tags': {
          adapter: r2Adapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },
        'music-tags': {
          adapter: r2Adapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },

        // Audio collections - R2 storage
        // Filenames automatically sanitized: "My Audio (1).mp3" -> "my-audio-1-xk2j9s.mp3"
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

        // Files collection - R2 storage
        files: {
          adapter: r2Adapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },
      },
    })(config)
  }
}
