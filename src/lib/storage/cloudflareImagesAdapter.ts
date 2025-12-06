/**
 * Cloudflare Images Storage Adapter for PayloadCMS
 *
 * Uploads images to Cloudflare Images API and stores Image IDs as filenames.
 * Automatic image optimization (WebP, AVIF) via format=auto parameter.
 */
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

import { validateFileUpload } from './uploadValidation'

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

    handleUpload: async ({ file, req }) => {
      try {
        // Validate file before upload
        validateFileUpload(file, { category: 'image' })

        const formData = new FormData()
        // Convert Buffer to Uint8Array for browser compatibility
        const uint8Array = new Uint8Array(file.buffer)
        const blob = new Blob([uint8Array], { type: file.mimeType })
        formData.append('file', blob, file.filename)

        req.payload.logger.info({ msg: 'Uploading image to Cloudflare Images', filename: file.filename })

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

        // Update both file.filename and req.file.name to the Cloudflare Image ID
        // This ensures PayloadCMS stores the correct ID in the database
        file.filename = imageId
        if (req.file) {
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
