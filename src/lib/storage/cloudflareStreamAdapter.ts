/**
 * Cloudflare Stream Storage Adapter for PayloadCMS
 *
 * Uploads videos to Cloudflare Stream API and stores Video IDs as filenames.
 * Automatic transcoding, HLS streaming, and thumbnail generation.
 * Enables MP4 downloads for HTML5 video compatibility.
 */
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

import { validateFileUpload } from './uploadValidation'

/**
 * Configuration for Cloudflare Stream adapter
 */
export interface CloudflareStreamConfig {
  /** Cloudflare account ID */
  accountId: string
  /** API token with Stream:Edit permission */
  apiKey: string
  /** Base delivery URL with customer code (e.g., "https://customer-<code>.cloudflarestream.com") */
  deliveryUrl: string
}

interface CloudflareStreamResponse {
  success: boolean
  errors?: Array<{ message: string }>
  result?: { uid: string }
}

/**
 * Create Cloudflare Stream storage adapter
 *
 * Uploads videos to Cloudflare Stream with automatic transcoding, HLS streaming,
 * and thumbnail generation. Enables MP4 downloads for HTML5 video compatibility.
 *
 * @param config - Cloudflare Stream configuration
 * @returns PayloadCMS storage adapter
 *
 * @example
 * ```ts
 * const adapter = cloudflareStreamAdapter({
 *   accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
 *   apiKey: process.env.CLOUDFLARE_API_KEY,
 *   deliveryUrl: process.env.CLOUDFLARE_STREAM_DELIVERY_URL,
 * })
 * ```
 */
export const cloudflareStreamAdapter = (config: CloudflareStreamConfig): Adapter => {
  return () => ({
    name: 'cloudflare-stream',

    handleUpload: async ({ file, req }) => {
      try {
        // Validate file before upload
        validateFileUpload(file, { category: 'video' })

        const formData = new FormData()
        // Convert Buffer to Uint8Array for browser compatibility
        const uint8Array = new Uint8Array(file.buffer)
        const blob = new Blob([uint8Array], { type: file.mimeType })
        formData.append('file', blob, file.filename)

        req.payload.logger.info({ msg: 'Uploading video to Cloudflare Stream', filename: file.filename })

        // Upload video to Stream
        const uploadResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: formData,
          },
        )

        const uploadResult = (await uploadResponse.json()) as CloudflareStreamResponse

        if (!uploadResult.success) {
          const errors = uploadResult.errors?.map((e) => e.message).join(', ') || 'Unknown error'
          throw new Error(`Cloudflare Stream upload failed: ${errors}`)
        }

        const videoId = uploadResult.result?.uid
        if (!videoId) {
          throw new Error('Cloudflare Stream response missing video ID')
        }

        req.payload.logger.info({ msg: 'Video uploaded successfully', videoId })

        // Enable MP4 downloads for HTML5 video compatibility
        try {
          const downloadsResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream/${videoId}/downloads`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
              },
            },
          )

          const downloadsResult = (await downloadsResponse.json()) as {
            success: boolean
            result?: {
              default?: {
                status: 'inprogress' | 'ready'
                url: string
                percentComplete?: number
              }
            }
            errors?: Array<{ message: string }>
          }

          if (!downloadsResult.success) {
            const errors = downloadsResult.errors?.map((e) => e.message).join(', ') || 'Unknown error'
            req.payload.logger.warn({ msg: 'Failed to enable MP4 downloads', videoId, errors })
          } else {
            const downloadStatus = downloadsResult.result?.default?.status || 'unknown'
            req.payload.logger.info({ msg: 'MP4 downloads enabled', videoId, status: downloadStatus })
          }
        } catch (error) {
          // Non-fatal error - video upload succeeded
          req.payload.logger.warn({
            msg: 'Error enabling MP4 downloads',
            videoId,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        // Update both file.filename and req.file.name to the Cloudflare Stream video ID
        // This ensures PayloadCMS stores the correct ID in the database
        file.filename = videoId
        if (req.file) {
          req.file.name = videoId
        }
      } catch (error) {
        req.payload.logger.error({
          msg: 'Cloudflare Stream upload error',
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.buffer.length,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },

    handleDelete: async ({ filename: videoId }) => {
      try {
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream/${videoId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
            },
          },
        )

        const result = (await response.json()) as CloudflareStreamResponse

        if (!result.success && response.status !== 404) {
          // Ignore 404 errors (video already deleted)
          const errors = result.errors?.map((e) => e.message).join(', ') || 'Unknown error'
          // eslint-disable-next-line no-console
          console.error(`[Cloudflare Stream] Delete warning for ${videoId}: ${errors}`)
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Cloudflare Stream] Delete error:', videoId, error)
        // Don't throw - deletion errors shouldn't break the app
      }
    },

    staticHandler: async (_req, { params }) => {
      // Redirect to Cloudflare Stream MP4 download URL
      const videoId = params.filename
      const url = `${config.deliveryUrl}/${videoId}/downloads/default.mp4`
      return Response.redirect(url, 302)
    },
  })
}
