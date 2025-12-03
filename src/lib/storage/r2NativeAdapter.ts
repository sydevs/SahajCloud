/**
 * Cloudflare R2 Native Storage Adapter for PayloadCMS
 *
 * Uses Cloudflare R2 native bindings (not S3-compatible API) for direct bucket access.
 * Better performance and simpler authentication than S3 API layer.
 */
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'
import type { R2Bucket } from '@cloudflare/workers-types'

import { logger } from '@/lib/logger'

export interface R2NativeConfig {
  bucket: R2Bucket
  publicUrl: string // e.g., "https://assets.sydevelopers.com"
}

export const r2NativeAdapter = (config: R2NativeConfig): Adapter => {
  return ({ collection, prefix }) => ({
    name: 'r2-native',

    handleUpload: async ({ file }) => {
      try {
        const key = prefix ? `${prefix}/${file.filename}` : file.filename

        logger.info(`Uploading file to R2: ${key}`)

        await config.bucket.put(key, file.buffer, {
          httpMetadata: {
            contentType: file.mimeType,
          },
        })

        logger.info(`File uploaded successfully to R2: ${key}`)

        // Return nothing - PayloadCMS will handle storing the filename
      } catch (error) {
        logger.error('R2 upload error:', error)
        throw error
      }
    },

    handleDelete: async ({ filename }) => {
      try {
        const key = prefix ? `${prefix}/${filename}` : filename

        logger.info(`Deleting file from R2: ${key}`)

        await config.bucket.delete(key)

        logger.info(`File deleted successfully from R2: ${key}`)
      } catch (error) {
        logger.error('R2 delete error:', error)
        // Don't throw - deletion errors shouldn't break the app
      }
    },

    staticHandler: async (req, { params }) => {
      try {
        const key = params.collection ? `${params.collection}/${params.filename}` : params.filename

        logger.debug(`Fetching file from R2: ${key}`)

        const object = await config.bucket.get(key)

        if (!object) {
          logger.warn(`File not found in R2: ${key}`)
          return new Response('Not Found', { status: 404 })
        }

        // Return file with appropriate headers
        return new Response(object.body, {
          headers: {
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
            ETag: object.etag,
          },
        })
      } catch (error) {
        logger.error('R2 static handler error:', error)
        return new Response('Internal Server Error', { status: 500 })
      }
    },
  })
}
