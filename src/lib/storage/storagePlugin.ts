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
import type { Plugin } from 'payload'

import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'

import { requireBinding, serverEnv } from '@/lib/env'

import { cloudflareImagesAdapter } from './cloudflareImagesAdapter'
import { cloudflareStreamAdapter } from './cloudflareStreamAdapter'
import { mixedMediaAdapter } from './mixedMediaAdapter'
import { createR2FilenameBeforeOperationHook } from './r2FilenameHook'
import { r2NativeAdapter } from './r2NativeAdapter'

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

const r2FilenameHooks = {
  always: createR2FilenameBeforeOperationHook('always'),
  'other-only': createR2FilenameBeforeOperationHook('other-only'),
}

const r2FilenameHookModes: Record<string, keyof typeof r2FilenameHooks> = {
  frames: 'other-only',
  files: 'other-only',
  'meditation-tags': 'always',
  'song-tags': 'always',
  meditations: 'always',
  songs: 'always',
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

    // Extract and validate Cloudflare credentials from validated env
    const accountId = serverEnv.CLOUDFLARE_ACCOUNT_ID
    const apiKey = serverEnv.CLOUDFLARE_API_KEY
    const imagesDeliveryUrl = serverEnv.CLOUDFLARE_IMAGES_DELIVERY_URL
    const streamDeliveryUrl = serverEnv.CLOUDFLARE_STREAM_DELIVERY_URL

    // If no env or missing credentials, use local storage (development fallback)
    if (!env || !accountId || !apiKey || !imagesDeliveryUrl || !streamDeliveryUrl) {
      return cloudStoragePlugin({
        enabled: false, // Disables cloud storage, uses local file storage
        collections: {},
      })(config)
    }

    // Env and credentials provided - validate R2 bucket binding using helper
    // Type assertion needed since env is unknown - runtime validation ensures correctness
    const envObj = env as Record<string, unknown>
    const r2Bucket = requireBinding<R2Bucket>(envObj.R2 as R2Bucket | undefined, 'R2')

    // Create storage adapters for Images and Stream using validated credentials
    // TypeScript now knows these are defined (not undefined) after the check above
    const imagesAdapter = cloudflareImagesAdapter({
      accountId,
      apiKey,
      deliveryUrl: imagesDeliveryUrl,
    })

    const streamAdapter = cloudflareStreamAdapter({
      accountId,
      apiKey,
      deliveryUrl: streamDeliveryUrl,
    })

    // Create R2 adapter for audio and file storage
    // All filenames are automatically sanitized (slugify + random suffix)
    // Note: R2_DELIVERY_URL may be undefined in development, falling back to empty string
    // The R2 adapter handles empty publicUrl by not generating public URLs
    const r2Adapter = r2NativeAdapter({
      bucket: r2Bucket,
      publicUrl: serverEnv.CLOUDFLARE_R2_DELIVERY_URL || '',
    })

    const configWithR2FilenameHooks = {
      ...config,
      collections: config.collections?.map((collection) => {
        const mode = r2FilenameHookModes[collection.slug]
        if (!mode) return collection

        return {
          ...collection,
          hooks: {
            ...collection.hooks,
            beforeOperation: [...(collection.hooks?.beforeOperation ?? []), r2FilenameHooks[mode]],
          },
        }
      }),
    }

    // Return a single cloudStoragePlugin with all adapters configured.
    //
    // ⚠️ When adding/removing an R2-backed collection here, also update
    // `r2FilenameHookModes` above. The two registries must stay in sync:
    // a collection that uses the R2 adapter (directly or via mixedMediaAdapter
    // for non-image/video files) without an entry in `r2FilenameHookModes`
    // will skip the preassignment hook and reintroduce the DB↔R2 filename
    // drift that this module exists to prevent.
    return cloudStoragePlugin({
      enabled: true,
      collections: {
        // Images collection - Cloudflare Images
        images: {
          adapter: imagesAdapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },

        // Frames collection - Mixed media adapter (Images for images, Stream for videos, R2 for others)
        frames: {
          adapter: mixedMediaAdapter({
            routes: {
              'image/': imagesAdapter,
              'video/': streamAdapter,
            },
            r2Adapter: r2Adapter,
          }),
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },

        // Videos collection - Cloudflare Stream only (video-only collection)
        videos: {
          adapter: streamAdapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },

        // Tag collections with SVG icons - R2 storage (Cloudflare Images doesn't support SVG)
        'meditation-tags': {
          adapter: r2Adapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },
        'song-tags': {
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
        songs: {
          adapter: r2Adapter,
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },

        // Files collection - Mixed media adapter (Images for images, Stream for videos, R2 for others)
        files: {
          adapter: mixedMediaAdapter({
            routes: {
              'image/': imagesAdapter,
              'video/': streamAdapter,
            },
            r2Adapter: r2Adapter,
          }),
          disableLocalStorage: true,
          disablePayloadAccessControl: true,
        },
      },
    })(configWithR2FilenameHooks)
  }
}
