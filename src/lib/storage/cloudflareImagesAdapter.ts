/**
 * Cloudflare Images Storage Adapter for PayloadCMS
 *
 * Uploads images to Cloudflare Images API and stores Image IDs as filenames.
 * Automatic image optimization (WebP, AVIF) via format=auto parameter.
 */
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

import { logger } from '@/lib/logger'

export interface CloudflareImagesConfig {
  accountId: string
  apiToken: string
  accountHash: string
}

export const cloudflareImagesAdapter = (config: CloudflareImagesConfig): Adapter => {
  return ({ collection, prefix }) => ({
    name: 'cloudflare-images',

    handleUpload: async ({ file }) => {
      try {
        const formData = new FormData()
        const blob = new Blob([file.buffer], { type: file.mimeType })
        formData.append('file', blob, file.filename)

        logger.info(`Uploading image to Cloudflare Images: ${file.filename}`)

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiToken}`,
            },
            body: formData,
          },
        )

        const result = await response.json()

        if (!result.success) {
          const errors = result.errors?.map((e: any) => e.message).join(', ') || 'Unknown error'
          throw new Error(`Cloudflare Images upload failed: ${errors}`)
        }

        const imageId = result.result.id

        logger.info(`Image uploaded successfully: ${imageId}`)

        // Return nothing - PayloadCMS will handle storing the imageId as filename
        // The imageId is already in the file object
      } catch (error) {
        logger.error('Cloudflare Images upload error:', error)
        throw error
      }
    },

    handleDelete: async ({ filename: imageId }) => {
      try {
        logger.info(`Deleting image from Cloudflare Images: ${imageId}`)

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1/${imageId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${config.apiToken}`,
            },
          },
        )

        const result = await response.json()

        if (!result.success && response.status !== 404) {
          // Ignore 404 errors (image already deleted)
          const errors = result.errors?.map((e: any) => e.message).join(', ') || 'Unknown error'
          logger.warn(`Cloudflare Images delete warning: ${errors}`)
        } else {
          logger.info(`Image deleted successfully: ${imageId}`)
        }
      } catch (error) {
        logger.error('Cloudflare Images delete error:', error)
        // Don't throw - deletion errors shouldn't break the app
      }
    },

    staticHandler: async (req, { params }) => {
      // Redirect to Cloudflare Images delivery URL
      const imageId = params.filename
      const url = `https://imagedelivery.net/${config.accountHash}/${imageId}/public`

      logger.debug(`Redirecting to Cloudflare Images URL: ${url}`)

      return Response.redirect(url, 302)
    },
  })
}
