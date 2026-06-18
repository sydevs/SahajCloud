/**
 * Cloudflare Images Storage Adapter for PayloadCMS
 *
 * Uploads images to Cloudflare Images API and stores Image IDs as filenames.
 * Automatic image optimization (WebP, AVIF) via format=auto parameter.
 */
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

import { z } from 'zod'

import { serverEnv } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/utilities/fetchWithTimeout'

import { CloudflareImagesResponseSchema } from './cloudflareSchemas'
import { applyFilename, generateCloudflareImageId } from './filenameUtils'
import {
  applyPreviewPrefix,
  isPreviewOwnedKey,
  shouldRefusePreviewDelete,
} from './previewIsolation'
import { storageLogger } from './storageLogger'
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
        // In non-prod, prefix the ID so the asset is namespaced to this
        // deployment and the delete guard / cleanup can recognize it as
        // preview-owned (see previewIsolation). No-op in production.
        const customId = applyPreviewPrefix(generateCloudflareImageId(file.filename))
        const originalFilename = file.filename

        const formData = new FormData()
        // Native Node Buffer works directly with Blob/FormData (the indexed
        // byte-copy was a Workers Buffer-polyfill workaround).
        const blob = new Blob([file.buffer], { type: file.mimeType })
        formData.append('file', blob, originalFilename)
        formData.append('id', customId)

        req.payload.logger.info({
          msg: 'Uploading image to Cloudflare Images',
          filename: originalFilename,
          customId,
        })

        const response = await fetchWithTimeout(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: formData,
            // Generous bound — catches a hung upload without killing a slow but
            // progressing large-image transfer. Response failures are still
            // validated via the Zod `result.success` check below.
            timeoutMs: 120_000,
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

        applyFilename(file, data, req, imageId, fileMetadata)

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
      // Preview isolation: a non-production deployment must never delete a
      // production image (cloned preview DBs reference real prod image IDs,
      // which carry no preview marker). No-op in production.
      if (
        await shouldRefusePreviewDelete('Cloudflare Images', imageId, () =>
          isPreviewOwnedKey(imageId),
        )
      ) {
        return
      }

      try {
        const response = await fetchWithTimeout(
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
          storageLogger.error({ msg: 'Cloudflare Images delete warning', imageId, errors })
        }
      } catch (error) {
        storageLogger.error({ msg: 'Cloudflare Images delete error', imageId, error })
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
