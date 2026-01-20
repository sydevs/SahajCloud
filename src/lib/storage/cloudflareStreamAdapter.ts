/**
 * Cloudflare Stream Storage Adapter for PayloadCMS
 *
 * Uploads videos to Cloudflare Stream API and stores Video IDs as filenames.
 * Automatic transcoding, HLS streaming, and thumbnail generation.
 * Enables MP4 downloads for HTML5 video compatibility.
 */
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'

import { z } from 'zod'

import { serverEnv } from '@/lib/env'

import { CloudflareStreamDownloadsResponseSchema, CloudflareStreamResponseSchema } from './cloudflareSchemas'
import { validateFileUpload } from './uploadValidation'

/**
 * Get Cloudflare Stream MP4 download URL for a video
 * @param filename - The Cloudflare Stream video ID
 * @returns URL string or undefined if delivery URL not configured
 */
export const getCloudflareStreamMp4Url = (filename: string): string | undefined => {
  const deliveryUrl = serverEnv.CLOUDFLARE_STREAM_DELIVERY_URL
  if (!deliveryUrl) return undefined
  return `${deliveryUrl}/${filename}/downloads/default.mp4`
}

/**
 * Get Cloudflare Stream thumbnail URL for a video
 * @param filename - The Cloudflare Stream video ID
 * @param height - Thumbnail height in pixels
 * @returns URL string or undefined if delivery URL not configured
 */
export const getCloudflareStreamThumbnailUrl = (
  filename: string,
  height: number,
): string | undefined => {
  const deliveryUrl = serverEnv.CLOUDFLARE_STREAM_DELIVERY_URL
  if (!deliveryUrl) return undefined
  return `${deliveryUrl}/${filename}/thumbnails/thumbnail.jpg?height=${height}`
}

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

    handleUpload: async ({ data, file, req }) => {
      try {
        // Validate file before upload
        validateFileUpload(file, { category: 'video' })

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

        const uploadResult = CloudflareStreamResponseSchema.parse(await uploadResponse.json())

        if (!uploadResult.success) {
          const errors = uploadResult.errors.map((e) => e.message).join(', ')
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

          const downloadsResult = CloudflareStreamDownloadsResponseSchema.parse(
            await downloadsResponse.json(),
          )

          if (!downloadsResult.success) {
            const errors = downloadsResult.errors.map((e) => e.message).join(', ')
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

        // Preserve original filename in fileMetadata for seed script deduplication
        // The original filename (e.g., "f47ac10b58cc4372.mp4") is used for matching
        // since the stored filename will be the Cloudflare Stream video ID
        if (data) {
          data.fileMetadata = {
            ...(typeof data.fileMetadata === 'object' && data.fileMetadata !== null
              ? data.fileMetadata
              : {}),
            originalFilename: file.filename,
          }
        }

        // Update filename in all locations to ensure PayloadCMS stores the Cloudflare Stream video ID
        // - data.filename: The object that will be saved to the database (passed by reference)
        // - file.filename: The file object used by the storage plugin
        // - req.file.name: The original request file (for consistency)
        // This eliminates the need for afterChange hooks to sync the filename
        file.filename = videoId
        if (data) {
          data.filename = videoId
        }
        if (req?.file) {
          req.file.name = videoId
        }
      } catch (error) {
        // Handle Zod validation errors with detailed messages
        if (error instanceof z.ZodError) {
          req.payload.logger.error({
            msg: 'Cloudflare Stream API response validation failed',
            filename: file.filename,
            validationIssues: error.issues,
          })
          throw new Error(`Cloudflare API response validation failed: ${error.message}`)
        }

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

        const result = CloudflareStreamResponseSchema.parse(await response.json())

        if (!result.success && response.status !== 404) {
          // Ignore 404 errors (video already deleted)
          const errors = result.errors.map((e) => e.message).join(', ')
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
