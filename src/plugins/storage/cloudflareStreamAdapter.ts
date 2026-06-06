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

import { CloudflareStreamResponseSchema } from './cloudflareSchemas'
import { applyFilename } from './filenameUtils'
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
 * Get Cloudflare Stream HLS manifest URL for a video
 * @param filename - The Cloudflare Stream video ID
 * @returns URL string or undefined if delivery URL not configured
 */
export const getCloudflareStreamHlsUrl = (filename: string): string | undefined => {
  const deliveryUrl = serverEnv.CLOUDFLARE_STREAM_DELIVERY_URL
  if (!deliveryUrl) return undefined
  return `${deliveryUrl}/${filename}/manifest/video.m3u8`
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
        // Native Node Buffer works directly with Blob/FormData (the indexed
        // byte-copy was a Workers Buffer-polyfill workaround).
        const blob = new Blob([file.buffer], { type: file.mimeType })
        formData.append('file', blob, file.filename)

        req.payload.logger.info({
          msg: 'Uploading video to Cloudflare Stream',
          filename: file.filename,
        })

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

        // Note: MP4 downloads are enabled asynchronously via a Cloudflare Stream webhook
        // once the video finishes transcoding. See src/app/(payload)/api/webhooks/cloudflare-stream/
        // and .claude/rules/storage.md.

        const originalFilename = file.filename
        const existingMetadata =
          typeof data?.fileMetadata === 'object' && data.fileMetadata !== null
            ? (data.fileMetadata as Record<string, unknown>)
            : {}
        const fileMetadata = {
          ...existingMetadata,
          originalFilename,
        }

        applyFilename(file, data, req, videoId, fileMetadata)

        return { filename: videoId, fileMetadata }
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
