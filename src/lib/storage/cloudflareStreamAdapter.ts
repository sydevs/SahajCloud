/**
 * Cloudflare Stream Storage Adapter for PayloadCMS
 *
 * Uploads videos to Cloudflare Stream API and stores Video IDs as filenames.
 * Automatic transcoding, HLS streaming, and thumbnail generation.
 * Enables MP4 downloads for HTML5 video compatibility.
 */
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

import { logger } from '@/lib/logger'

export interface CloudflareStreamConfig {
  accountId: string
  apiToken: string
  customerCode: string
}

export const cloudflareStreamAdapter = (config: CloudflareStreamConfig): Adapter => {
  return ({ collection, prefix }) => ({
    name: 'cloudflare-stream',

    handleUpload: async ({ file }) => {
      try {
        const formData = new FormData()
        const blob = new Blob([file.buffer], { type: file.mimeType })
        formData.append('file', blob, file.filename)

        logger.info(`Uploading video to Cloudflare Stream: ${file.filename}`)

        // Upload video to Stream
        const uploadResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiToken}`,
            },
            body: formData,
          },
        )

        const uploadResult = await uploadResponse.json()

        if (!uploadResult.success) {
          const errors =
            uploadResult.errors?.map((e: any) => e.message).join(', ') || 'Unknown error'
          throw new Error(`Cloudflare Stream upload failed: ${errors}`)
        }

        const videoId = uploadResult.result.uid

        logger.info(`Video uploaded successfully: ${videoId}`)

        // Enable MP4 downloads for HTML5 video compatibility
        try {
          logger.info(`Enabling MP4 downloads for video: ${videoId}`)

          const downloadsResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream/${videoId}/downloads`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json',
              },
            },
          )

          const downloadsResult = await downloadsResponse.json()

          if (!downloadsResult.success) {
            logger.warn(`Failed to enable MP4 downloads for ${videoId}`)
          } else {
            logger.info(`MP4 downloads enabled for video: ${videoId}`)
          }
        } catch (error) {
          // Non-fatal error - video upload succeeded
          logger.warn('Error enabling MP4 downloads:', error)
        }

        // Return nothing - PayloadCMS will handle storing the videoId as filename
      } catch (error) {
        logger.error('Cloudflare Stream upload error:', error)
        throw error
      }
    },

    handleDelete: async ({ filename: videoId }) => {
      try {
        logger.info(`Deleting video from Cloudflare Stream: ${videoId}`)

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream/${videoId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${config.apiToken}`,
            },
          },
        )

        const result = await response.json()

        if (!result.success && response.status !== 404) {
          // Ignore 404 errors (video already deleted)
          const errors = result.errors?.map((e: any) => e.message).join(', ') || 'Unknown error'
          logger.warn(`Cloudflare Stream delete warning: ${errors}`)
        } else {
          logger.info(`Video deleted successfully: ${videoId}`)
        }
      } catch (error) {
        logger.error('Cloudflare Stream delete error:', error)
        // Don't throw - deletion errors shouldn't break the app
      }
    },

    staticHandler: async (req, { params }) => {
      // Redirect to Cloudflare Stream MP4 download URL
      const videoId = params.filename
      const url = `https://customer-${config.customerCode}.cloudflarestream.com/${videoId}/downloads/default.mp4`

      logger.debug(`Redirecting to Cloudflare Stream URL: ${url}`)

      return Response.redirect(url, 302)
    },
  })
}
