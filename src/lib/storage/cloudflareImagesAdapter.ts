/**
 * Cloudflare Images Storage Adapter for PayloadCMS
 *
 * Uploads images to Cloudflare Images API and stores Image IDs as filenames.
 * Automatic image optimization (WebP, AVIF) via format=auto parameter.
 */
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

import { validateFileUpload } from './uploadValidation'

/**
 * Get Cloudflare Images URL for a filename
 * @param filename - The Cloudflare Image ID
 * @param variant - Optional variant/transformation string (e.g., "format=auto,width=320")
 * @returns URL string or undefined if delivery URL not configured
 */
export const getCloudflareImagesUrl = (
  filename: string,
  variant = 'public',
): string | undefined => {
  const deliveryUrl = process.env.CLOUDFLARE_IMAGES_DELIVERY_URL
  if (!deliveryUrl) return undefined
  return `${deliveryUrl}/${filename}/${variant}`
}

/**
 * Configuration for Cloudflare Images adapter
 */
export interface CloudflareImagesConfig {
  /** Cloudflare account ID */
  accountId: string
  /** API token with Images:Edit permission */
  apiKey: string
  /** Base delivery URL including account hash (e.g., "https://imagedelivery.net/<hash>") */
  deliveryUrl: string
}

interface CloudflareImagesResponse {
  success: boolean
  errors?: Array<{ message: string }>
  result?: { id: string }
}

/**
 * Create Cloudflare Images storage adapter
 *
 * Uploads images to Cloudflare Images API with automatic optimization (WebP, AVIF).
 * Images are identified by Cloudflare-generated IDs stored as filenames.
 *
 * @param config - Cloudflare Images configuration
 * @returns PayloadCMS storage adapter
 *
 * @example
 * ```ts
 * const adapter = cloudflareImagesAdapter({
 *   accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
 *   apiKey: process.env.CLOUDFLARE_API_KEY,
 *   deliveryUrl: process.env.CLOUDFLARE_IMAGES_DELIVERY_URL,
 * })
 * ```
 */
export const cloudflareImagesAdapter = (config: CloudflareImagesConfig): Adapter => {
  return () => ({
    name: 'cloudflare-images',

    handleUpload: async ({ data, file, req }) => {
      try {
        // Validate file before upload
        validateFileUpload(file, { category: 'image' })

        const formData = new FormData()
        // Convert Buffer to Uint8Array for Cloudflare Workers compatibility
        // IMPORTANT: The Workers Buffer polyfill has multiple broken methods.
        // Do NOT use: Uint8Array.from(), buffer.buffer, buffer.byteOffset, or set().
        // Use manual indexed copy which is the only reliable method.
        const uint8Array = new Uint8Array(file.buffer.length)
        for (let i = 0; i < file.buffer.length; i++) {
          uint8Array[i] = file.buffer[i]
        }
        const blob = new Blob([uint8Array], { type: file.mimeType })
        formData.append('file', blob, file.filename)

        req.payload.logger.info({
          msg: 'Uploading image to Cloudflare Images',
          filename: file.filename,
        })

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: formData,
          },
        )

        const result = (await response.json()) as CloudflareImagesResponse

        if (!result.success) {
          const errors = result.errors?.map((e) => e.message).join(', ') || 'Unknown error'
          throw new Error(`Cloudflare Images upload failed: ${errors}`)
        }

        const imageId = result.result?.id
        if (!imageId) {
          throw new Error('Cloudflare Images response missing image ID')
        }

        req.payload.logger.info({ msg: 'Image uploaded successfully', imageId })

        // Preserve original filename in fileMetadata for seed script deduplication
        // The original filename (e.g., "f47ac10b58cc4372.jpg") is used for matching
        // since the stored filename will be the Cloudflare Image ID
        if (data) {
          data.fileMetadata = {
            ...(typeof data.fileMetadata === 'object' && data.fileMetadata !== null
              ? data.fileMetadata
              : {}),
            originalFilename: file.filename,
          }
        }

        // Update filename in all locations to ensure PayloadCMS stores the Cloudflare Image ID
        // - data.filename: The object that will be saved to the database (passed by reference)
        // - file.filename: The file object used by the storage plugin
        // - req.file.name: The original request file (for consistency)
        // This eliminates the need for afterChange hooks to sync the filename
        file.filename = imageId
        if (data) {
          data.filename = imageId
        }
        if (req?.file) {
          req.file.name = imageId
        }
      } catch (error) {
        req.payload.logger.error({
          msg: 'Cloudflare Images upload error',
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.buffer.length,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },

    handleDelete: async ({ filename: imageId }) => {
      try {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1/${imageId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
            },
          },
        )

        const result = (await response.json()) as CloudflareImagesResponse

        if (!result.success && response.status !== 404) {
          // Ignore 404 errors (image already deleted)
          const errors = result.errors?.map((e) => e.message).join(', ') || 'Unknown error'
          // eslint-disable-next-line no-console
          console.error(`[Cloudflare Images] Delete warning for ${imageId}: ${errors}`)
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Cloudflare Images] Delete error:', imageId, error)
        // Don't throw - deletion errors shouldn't break the app
      }
    },

    staticHandler: async (_req, { params }) => {
      // Redirect to Cloudflare Images delivery URL
      const imageId = params.filename
      const url = `${config.deliveryUrl}/${imageId}/public`
      return Response.redirect(url, 302)
    },
  })
}
