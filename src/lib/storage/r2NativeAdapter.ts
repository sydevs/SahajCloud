/**
 * Cloudflare R2 Native Storage Adapter for PayloadCMS
 *
 * Uses Cloudflare R2 native bindings (not S3-compatible API) for direct bucket access.
 * Better performance and simpler authentication than S3 API layer.
 *
 * Supports optional filename sanitization to create URL-safe filenames with unique suffixes.
 */
import type { R2Bucket } from '@cloudflare/workers-types'
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

import slugify from 'slugify'

/**
 * Configuration for R2 native storage adapter
 */
export interface R2NativeConfig {
  /** R2 bucket instance from Cloudflare Workers bindings */
  bucket: R2Bucket
  /** Public URL for accessing R2 assets (e.g., "https://assets.sydevelopers.com") */
  publicUrl: string
  /**
   * Whether to sanitize filenames before upload.
   * When true, filenames are slugified and a random suffix is added.
   * @default false
   */
  sanitizeFilenames?: boolean
}

/**
 * Sanitize filename for safe storage
 *
 * Converts filename to URL-safe slug and adds random suffix to prevent collisions.
 *
 * @param filename - Original filename
 * @returns Sanitized filename
 *
 * @example
 * Input: "My Photo (1).mp3"
 * Output: "my-photo-1-xk2j9s.mp3"
 */
const sanitizeFilename = (filename: string): string => {
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
 * @param config - R2 native configuration
 * @returns PayloadCMS storage adapter
 *
 * @example Without filename sanitization (preserves original filenames)
 * ```ts
 * const adapter = r2NativeAdapter({
 *   bucket: env.R2,
 *   publicUrl: process.env.CLOUDFLARE_R2_DELIVERY_URL,
 * })
 * ```
 *
 * @example With filename sanitization (for audio collections)
 * ```ts
 * const adapter = r2NativeAdapter({
 *   bucket: env.R2,
 *   publicUrl: process.env.CLOUDFLARE_R2_DELIVERY_URL,
 *   sanitizeFilenames: true,
 * })
 * ```
 */
export const r2NativeAdapter = (config: R2NativeConfig): Adapter => {
  const { bucket, sanitizeFilenames: shouldSanitize = false } = config

  return ({ prefix }) => ({
    name: 'r2-native',

    handleUpload: async ({ data, file, req }) => {
      try {
        // Optionally sanitize the filename
        let finalFilename = file.filename
        if (shouldSanitize) {
          finalFilename = sanitizeFilename(file.filename)

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
        }

        const key = prefix ? `${prefix}/${finalFilename}` : finalFilename

        await bucket.put(key, file.buffer, {
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
