/**
 * Cloudflare R2 Native Storage Adapter for PayloadCMS
 *
 * Uses Cloudflare R2 native bindings (not S3-compatible API) for direct bucket access.
 * Better performance and simpler authentication than S3 API layer.
 */
import type { R2Bucket } from '@cloudflare/workers-types'
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

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
 * Create R2 native storage adapter
 *
 * Uses Cloudflare R2 native bindings for direct bucket access with high performance.
 * Does not use S3-compatible API layer.
 *
 * @param config - R2 native configuration
 * @returns PayloadCMS storage adapter
 *
 * @example
 * ```ts
 * const adapter = r2NativeAdapter({
 *   bucket: env.R2, // From Cloudflare Workers bindings
 *   publicUrl: process.env.CLOUDFLARE_R2_DELIVERY_URL,
 * })
 * ```
 */
export const r2NativeAdapter = (config: R2NativeConfig): Adapter => {
  return ({ prefix }) => ({
    name: 'r2-native',

    handleUpload: async ({ file }) => {
      try {
        const key = prefix ? `${prefix}/${file.filename}` : file.filename

        await config.bucket.put(key, file.buffer, {
          httpMetadata: {
            contentType: file.mimeType,
          },
        })

        // Return nothing - PayloadCMS will handle storing the filename
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
