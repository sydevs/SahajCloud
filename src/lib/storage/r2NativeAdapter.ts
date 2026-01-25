/**
 * Cloudflare R2 Native Storage Adapter for PayloadCMS
 *
 * Uses Cloudflare R2 native bindings (not S3-compatible API) for direct bucket access.
 * Better performance and simpler authentication than S3 API layer.
 *
 * Automatically sanitizes filenames to create URL-safe slugs with unique suffixes.
 */
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

import slugify from 'slugify'

import { serverEnv } from '@/lib/env'

/**
 * Get R2 storage URL for a filename
 * @returns URL string or undefined if delivery URL not configured
 */
export const getR2Url = (filename: string): string | undefined => {
  const deliveryUrl = serverEnv.CLOUDFLARE_R2_DELIVERY_URL
  if (!deliveryUrl) return undefined
  return `${deliveryUrl}/${filename}`
}

/**
 * Configuration for R2 native storage adapter
 */
export interface R2NativeConfig {
  /** R2 bucket instance from Cloudflare Workers bindings */
  bucket: R2Bucket
  /** Public URL for accessing R2 assets (e.g., "https://assets.sydevelopers.com") */
  publicUrl: string
}

/**
 * Sanitize filename for safe storage
 *
 * Converts filename to URL-safe slug and adds random suffix to prevent collisions.
 * Exported for testing purposes.
 *
 * @param filename - Original filename
 * @returns Sanitized filename
 *
 * @example
 * Input: "My Photo (1).mp3"
 * Output: "my-photo-1-xk2j9s.mp3"
 */
export const sanitizeFilename = (filename: string): string => {
  const parts = filename.split('.')
  const ext = parts.length > 1 ? parts.pop() : ''
  const baseName = parts.join('.')

  const slugified = slugify(baseName, { strict: true, lower: true })
  const randomSuffix = (Math.random() + 1).toString(36).substring(2)

  return ext ? `${slugified}-${randomSuffix}.${ext}` : `${slugified}-${randomSuffix}`
}

/**
 * Create R2 native storage adapter
 *
 * Uses Cloudflare R2 native bindings for direct bucket access with high performance.
 * Does not use S3-compatible API layer.
 *
 * Automatically sanitizes all filenames to URL-safe slugs with random suffixes.
 *
 * @param config - R2 native configuration
 * @returns PayloadCMS storage adapter
 *
 * @example
 * ```ts
 * const adapter = r2NativeAdapter({
 *   bucket: env.R2,
 *   publicUrl: process.env.CLOUDFLARE_R2_DELIVERY_URL,
 * })
 * ```
 */
export const r2NativeAdapter = (config: R2NativeConfig): Adapter => {
  const { bucket } = config

  return ({ prefix }) => ({
    name: 'r2-native',

    handleUpload: async ({ data, file, req }) => {
      try {
        // Sanitize the filename to URL-safe slug with random suffix
        const finalFilename = sanitizeFilename(file.filename)

        // Update filename in all locations
        // - data.filename: The object that will be saved to the database (passed by reference)
        // - file.filename: The file object used by the storage plugin
        // - req.file.name: The original request file (for consistency)
        file.filename = finalFilename
        if (data) {
          data.filename = finalFilename
        }
        if (req?.file) {
          req.file.name = finalFilename
        }

        const key = prefix ? `${prefix}/${finalFilename}` : finalFilename

        // Convert Buffer to clean Uint8Array for Cloudflare Workers compatibility
        // IMPORTANT: The Workers Buffer polyfill has broken methods that cause
        // "offset argument must be of type number" errors. Use manual indexed copy.
        const uint8Array = new Uint8Array(file.buffer.length)
        for (let i = 0; i < file.buffer.length; i++) {
          uint8Array[i] = file.buffer[i]
        }

        await bucket.put(key, uint8Array, {
          httpMetadata: {
            contentType: file.mimeType,
          },
        })
      } catch (error) {
        const key = prefix ? `${prefix}/${file.filename}` : file.filename
        // eslint-disable-next-line no-console
        console.error('[R2] Upload error:', key, error)
        throw error
      }
    },

    handleDelete: async ({ filename }) => {
      try {
        const key = prefix ? `${prefix}/${filename}` : filename
        await config.bucket.delete(key)
      } catch (error) {
        const key = prefix ? `${prefix}/${filename}` : filename
        // Using console.error because storage adapters don't have access to Payload's logger.
        // The adapter is initialized before Payload and doesn't receive req context.
        // eslint-disable-next-line no-console
        console.error('[R2] Delete error:', key, error)
        // Don't throw - deletion errors shouldn't break the app
      }
    },

    staticHandler: async (_req, { params }) => {
      try {
        const key = params.collection ? `${params.collection}/${params.filename}` : params.filename

        const object = await config.bucket.get(key)

        if (!object) {
          return new Response('Not Found', { status: 404 })
        }

        // Return file with appropriate headers
        // Cast R2 ReadableStream to web standard ReadableStream
        return new Response(object.body as unknown as ReadableStream, {
          headers: {
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
            ETag: object.etag,
          },
        })
      } catch (error) {
        const key = params.collection ? `${params.collection}/${params.filename}` : params.filename
        // eslint-disable-next-line no-console
        console.error('[R2] Static handler error:', key, error)
        return new Response('Internal Server Error', { status: 500 })
      }
    },
  })
}
