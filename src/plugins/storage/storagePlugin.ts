/**
 * Storage configuration for Payload CMS
 *
 * Uses Cloudflare Images for image storage, Cloudflare Stream for video storage,
 * and an R2 adapter (S3-compatible API) for audio files and generic files.
 *
 * All storage adapters handle filename management internally:
 * - Cloudflare Images/Stream: Stores service-generated IDs as filenames
 * - R2: Sanitizes filenames (slugify + random suffix) for all uploads
 *
 * Automatically falls back to local file storage in development when the
 * storage credentials are not configured.
 */
import type { Config, Field, Plugin } from 'payload'

import { S3Client } from '@aws-sdk/client-s3'
import { cloudStoragePlugin } from '@payloadcms/plugin-cloud-storage'

import { serverEnv } from '@/lib/env'

import { cloudflareImagesAdapter } from './cloudflareImagesAdapter'
import { cloudflareStreamAdapter } from './cloudflareStreamAdapter'
import { mixedMediaAdapter } from './mixedMediaAdapter'
import { createR2FilenameBeforeOperationHook } from './r2FilenameHook'
import { r2NativeAdapter } from './r2NativeAdapter'
import { withUploadNotice } from './uploadNotice'

interface StoragePluginOptions {
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
  'user-choices': 'always',
  'song-tags': 'always',
  meditations: 'always',
  songs: 'always',
  'event-imports': 'always',
}

/**
 * Every collection `cloudStoragePlugin` manages, and which backend stores it.
 * `mixed` routes by MIME type: Images for images, Stream for video, R2 for the
 * rest. SVG tag icons go to R2 because Cloudflare Images can't serve SVG.
 */
const STORAGE_BACKENDS = {
  images: 'images',
  frames: 'mixed',
  videos: 'stream',
  'user-choices': 'r2',
  'song-tags': 'r2',
  meditations: 'r2',
  songs: 'r2',
  files: 'mixed',
  'event-imports': 'r2',
} as const

/**
 * ⚠ The plugin stores an `_objectKey` column on every collection it manages
 * (3.90+) — but only when enabled, and it is disabled wherever the Cloudflare
 * credentials are absent: local dev, the test suite, and `migrate:create`. So
 * the schema those see lacked a column production's queries select, and every
 * upload on a Railway deploy failed with `column images._objectkey does not
 * exist`. Declaring it here keeps one schema whatever the credentials; an
 * enabled plugin swaps in its own identical definition.
 */
const withObjectKeyColumn = (config: Config): Config => ({
  ...config,
  collections: config.collections?.map((collection) => {
    if (!(collection.slug in STORAGE_BACKENDS)) return collection
    if (collection.fields.some((field) => 'name' in field && field.name === '_objectKey')) {
      return collection
    }
    const objectKey: Field = {
      name: '_objectKey',
      type: 'text',
      admin: { hidden: true, readOnly: true },
    }
    return { ...collection, fields: [...collection.fields, objectKey] }
  }),
})

/**
 * Create the storage configuration (Cloudflare Images/Stream + R2 over S3)
 *
 * @param options - Plugin options
 * @returns PayloadCMS storage plugin
 */
export const storagePlugin = (options: StoragePluginOptions = {}): Plugin => {
  const { enabled = true } = options

  return (incomingConfig) => {
    // Both transforms run above every return below, so the schema and the
    // uploading notice do not depend on the credentials or on `enabled`.
    const config = withUploadNotice(withObjectKeyColumn(incomingConfig))

    // Early return if plugin is disabled - use cloudStoragePlugin for consistent behavior
    if (!enabled) {
      return cloudStoragePlugin({
        enabled: false,
        collections: {},
      })(config)
    }

    // Extract and validate credentials from validated env. Images/Stream use the
    // Cloudflare HTTPS APIs; R2 uses the S3-compatible API.
    const accountId = serverEnv.CLOUDFLARE_ACCOUNT_ID
    const apiKey = serverEnv.CLOUDFLARE_API_KEY
    const imagesDeliveryUrl = serverEnv.CLOUDFLARE_IMAGES_DELIVERY_URL
    const streamDeliveryUrl = serverEnv.CLOUDFLARE_STREAM_DELIVERY_URL
    const r2Bucket = serverEnv.R2_BUCKET
    const r2AccessKeyId = serverEnv.R2_ACCESS_KEY_ID
    const r2SecretAccessKey = serverEnv.R2_SECRET_ACCESS_KEY
    // Optional S3 endpoint override for jurisdiction-specific buckets (e.g. EU);
    // falls back to the account-derived default below when unset.
    const r2Endpoint = serverEnv.R2_S3_ENDPOINT

    // If any credential is missing, use local storage (development fallback)
    if (
      !accountId ||
      !apiKey ||
      !imagesDeliveryUrl ||
      !streamDeliveryUrl ||
      !r2Bucket ||
      !r2AccessKeyId ||
      !r2SecretAccessKey
    ) {
      return cloudStoragePlugin({
        enabled: false, // Disables cloud storage, uses local file storage
        collections: {},
      })(config)
    }

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

    // R2 over the S3-compatible API. Defaults to the account-derived endpoint
    // (https://<accountId>.r2.cloudflarestorage.com); a jurisdiction-specific
    // bucket (e.g. EU → https://<accountId>.eu.r2.cloudflarestorage.com) must set
    // R2_S3_ENDPOINT. The native R2 binding hid this; the S3 API needs the exact
    // endpoint or it can't find the bucket.
    const r2Client = new S3Client({
      region: 'auto',
      endpoint: r2Endpoint || `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
    })

    // Create R2 adapter for audio and file storage
    // All filenames are automatically sanitized (slugify + random suffix)
    // Note: CLOUDFLARE_R2_DELIVERY_URL may be undefined in development, falling
    // back to empty string; the adapter handles empty publicUrl gracefully.
    const r2Adapter = r2NativeAdapter({
      client: r2Client,
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
    // ⚠️ When adding/removing an R2-backed collection in `STORAGE_BACKENDS`, also
    // update `r2FilenameHookModes` above. The two registries must stay in sync:
    // a collection that uses the R2 adapter (directly or via mixedMediaAdapter
    // for non-image/video files) without an entry in `r2FilenameHookModes`
    // will skip the preassignment hook and reintroduce the DB↔R2 filename
    // drift that this module exists to prevent.
    const adapters = {
      images: imagesAdapter,
      stream: streamAdapter,
      r2: r2Adapter,
      mixed: mixedMediaAdapter({
        routes: {
          'image/': imagesAdapter,
          'video/': streamAdapter,
        },
        r2Adapter: r2Adapter,
      }),
    }

    return cloudStoragePlugin({
      enabled: true,
      collections: Object.fromEntries(
        Object.entries(STORAGE_BACKENDS).map(([slug, backend]) => [
          slug,
          {
            adapter: adapters[backend],
            disableLocalStorage: true,
            disablePayloadAccessControl: true,
          },
        ]),
      ),
    })(configWithR2FilenameHooks)
  }
}
