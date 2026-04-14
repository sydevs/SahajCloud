/**
 * Cloudflare Images Storage Adapter for PayloadCMS
 *
 * Uploads images to Cloudflare Images API and stores Image IDs as filenames.
 * Automatic image optimization (WebP, AVIF) via format=auto parameter.
 */
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

import { z } from 'zod'

import { serverEnv } from '@/lib/env'

import { CloudflareImagesResponseSchema } from './cloudflareSchemas'
import { generateCloudflareImageId } from './filenameUtils'
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
  const deliveryUrl = serverEnv.CLOUDFLARE_IMAGES_DELIVERY_URL
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

        // Use a human-readable slug as the Cloudflare Image ID so the delivery
        // URL (.../<id>/public) is debuggable. CF rejects duplicate IDs; the
        // random suffix baked into the slug makes collisions negligible.
        const customId = generateCloudflareImageId(file.filename)
        const originalFilename = file.filename

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
        formData.append('file', blob, originalFilename)
        formData.append('id', customId)

        req.payload.logger.info({
          msg: 'Uploading image to Cloudflare Images',
          filename: originalFilename,
          customId,
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

        const result = CloudflareImagesResponseSchema.parse(await response.json())

        if (!result.success) {
          const errors = result.errors.map((e) => e.message).join(', ')
          throw new Error(`Cloudflare Images upload failed: ${errors}`)
        }

        // CF echoes back the ID we sent — trust the response rather than our
        // local customId so any server-side normalization is reflected.
        const imageId = result.result?.id
        if (!imageId) {
          throw new Error('Cloudflare Images response missing image ID')
        }

        req.payload.logger.info({ msg: 'Image uploaded successfully', imageId })

        const existingMetadata =
          typeof data?.fileMetadata === 'object' && data.fileMetadata !== null
            ? (data.fileMetadata as Record<string, unknown>)
            : {}
        const fileMetadata = {
          ...existingMetadata,
          originalFilename,
        }

        // Mirror the new filename and metadata to in-memory locations so
        // downstream afterChange hooks see them. The values are persisted
        // to the DB via this function's return value (see
        // @payloadcms/plugin-cloud-storage afterChange hook, which merges
        // the return into a payload.update call).
        file.filename = imageId
        if (data) {
          data.filename = imageId
          data.fileMetadata = fileMetadata
        }
        if (req?.file) {
          req.file.name = imageId
        }

        return { filename: imageId, fileMetadata }
      } catch (error) {
        // Handle Zod validation errors with detailed messages
        if (error instanceof z.ZodError) {
          req.payload.logger.error({
            msg: 'Cloudflare Images API response validation failed',
            filename: file.filename,
            validationIssues: error.issues,
          })
          throw new Error(`Cloudflare API response validation failed: ${error.message}`)
        }

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

        const result = CloudflareImagesResponseSchema.parse(await response.json())

        if (!result.success && response.status !== 404) {
          // Ignore 404 errors (image already deleted)
          const errors = result.errors.map((e) => e.message).join(', ')
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
