/**
 * Zod Schemas for Cloudflare API Responses
 *
 * Provides runtime validation for Cloudflare Images and Stream API responses.
 * Ensures type safety and provides detailed error messages when API responses
 * don't match the expected structure.
 *
 * @see https://developers.cloudflare.com/images/api-reference/
 * @see https://developers.cloudflare.com/stream/api-reference/
 */
import { z } from 'zod'

/**
 * Common Cloudflare API error schema
 */
export const CloudflareErrorSchema = z.object({
  code: z.number().optional(),
  message: z.string(),
})

/**
 * Base Cloudflare API response structure
 */
const CloudflareBaseResponseSchema = z.object({
  success: z.boolean(),
  errors: z.array(CloudflareErrorSchema).default([]),
  messages: z.array(z.string()).optional(),
})

/**
 * Cloudflare Images upload/delete response
 *
 * @see https://developers.cloudflare.com/images/api-reference/images/#upload-an-image-via-url
 */
export const CloudflareImagesResponseSchema = CloudflareBaseResponseSchema.extend({
  result: z
    .object({
      id: z.string().min(1),
      filename: z.string().optional(),
      uploaded: z.string().optional(),
      requireSignedURLs: z.boolean().optional(),
      variants: z.array(z.string()).optional(),
    })
    // CF returns `result: null` (not absent) when success is false — accept it so
    // the adapter can surface the real `errors[]` instead of a schema parse error.
    .nullish(),
})

/**
 * Cloudflare Stream upload response
 *
 * @see https://developers.cloudflare.com/stream/api-reference/videos/#upload-a-video-from-a-url
 */
export const CloudflareStreamResponseSchema = CloudflareBaseResponseSchema.extend({
  result: z
    .object({
      uid: z.string().min(1),
      thumbnail: z.url().optional(),
      thumbnailTimestampPct: z.number().optional(),
      readyToStream: z.boolean().optional(),
      status: z
        .object({
          state: z.string(),
          pctComplete: z.string().optional(),
          errorReasonCode: z.string().optional(),
          errorReasonText: z.string().optional(),
        })
        .optional(),
      meta: z.record(z.string(), z.string()).optional(),
      created: z.string().optional(),
      modified: z.string().optional(),
      size: z.number().optional(),
      preview: z.url().optional(),
      allowedOrigins: z.array(z.string()).optional(),
      requireSignedURLs: z.boolean().optional(),
      uploaded: z.string().optional(),
      // These fields can be null in Cloudflare API responses (not just undefined)
      uploadExpiry: z.string().nullish(),
      maxSizeBytes: z.number().nullish(),
      maxDurationSeconds: z.number().nullish(),
      duration: z.number().optional(),
      input: z
        .object({
          width: z.number().optional(),
          height: z.number().optional(),
        })
        .optional(),
      playback: z
        .object({
          hls: z.url().optional(),
          dash: z.url().optional(),
        })
        .optional(),
      // watermark can also be null in Cloudflare API responses
      watermark: z
        .object({
          uid: z.string().optional(),
        })
        .nullish(),
    })
    // CF returns `result: null` on failure — see the Images schema note.
    .nullish(),
})

/**
 * Cloudflare Stream downloads API response
 *
 * @see https://developers.cloudflare.com/stream/api-reference/downloads/#enable-downloads
 */
export const CloudflareStreamDownloadsResponseSchema = CloudflareBaseResponseSchema.extend({
  result: z
    .object({
      default: z
        .object({
          status: z.enum(['inprogress', 'ready', 'error']),
          url: z.url().optional(),
          percentComplete: z.number().min(0).max(100).optional(),
        })
        .optional(),
    })
    // CF returns `result: null` on failure — see the Images schema note.
    .nullish(),
})

/**
 * Cloudflare Stream webhook payload
 *
 * Sent when a video reaches a terminal state (ready or error). The shape
 * mirrors `GET /stream/{uid}` — we only validate the fields we actually use
 * and pass unknown fields through so Cloudflare can add new ones without
 * breaking us.
 *
 * @see https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 */
export const CloudflareStreamWebhookPayloadSchema = z
  .object({
    uid: z.string().min(1),
    readyToStream: z.boolean().optional(),
    status: z.object({
      state: z.string(),
      pctComplete: z.string().optional(),
      errorReasonCode: z.string().optional(),
      errorReasonText: z.string().optional(),
    }),
    meta: z.record(z.string(), z.string()).optional(),
    created: z.string().optional(),
    modified: z.string().optional(),
    duration: z.number().optional(),
  })
  .passthrough()

// Type inference for TypeScript
export type CloudflareImagesResponse = z.infer<typeof CloudflareImagesResponseSchema>
export type CloudflareStreamResponse = z.infer<typeof CloudflareStreamResponseSchema>
export type CloudflareStreamDownloadsResponse = z.infer<
  typeof CloudflareStreamDownloadsResponseSchema
>
export type CloudflareStreamWebhookPayload = z.infer<typeof CloudflareStreamWebhookPayloadSchema>
