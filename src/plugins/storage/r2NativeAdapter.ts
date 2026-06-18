/**
 * Cloudflare R2 Storage Adapter for PayloadCMS (S3 API)
 *
 * Reads/writes R2 over the S3-compatible API (@aws-sdk/client-s3) pointed at the
 * R2 endpoint `https://<accountId>.r2.cloudflarestorage.com`. Previously this
 * used the Workers R2Bucket native binding; on a Node host the S3 API is the
 * supported path. Delivery domains (e.g. assets.sydevelopers.com) are unchanged.
 *
 * Automatically sanitizes filenames to create URL-safe slugs with unique suffixes.
 */
import type { S3Client } from '@aws-sdk/client-s3'
import type { Adapter, HandleUpload } from '@payloadcms/plugin-cloud-storage/types'

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

import { serverEnv } from '@/lib/env'

import { applyFilename, generateR2Key } from './filenameUtils'
import {
  applyPreviewPrefix,
  isPreviewOwnedKey,
  shouldRefusePreviewDelete,
} from './previewIsolation'
import { R2_PREASSIGNED_FILENAME_CONTEXT_KEY } from './r2FilenameHook'

/**
 * Get R2 storage URL for a filename
 * @returns URL string or undefined if delivery URL not configured
 */
export const getR2Url = (filename: string): string | undefined => {
  const deliveryUrl = serverEnv.CLOUDFLARE_R2_DELIVERY_URL
  if (!deliveryUrl) return undefined
  return `${deliveryUrl}/${filename}`
}

/**
 * Configuration for the R2 (S3 API) storage adapter
 */
export interface R2NativeConfig {
  /** S3 client configured against the R2 S3 endpoint */
  client: S3Client
  /** R2 bucket name */
  bucket: string
  /** Public URL for accessing R2 assets (e.g., "https://assets.sydevelopers.com"); empty in dev */
  publicUrl: string
}

/**
 * Create the R2 storage adapter (S3-compatible API)
 *
 * Automatically sanitizes all filenames to URL-safe slugs with random suffixes.
 *
 * @param config - R2 (S3) configuration
 * @returns PayloadCMS storage adapter
 *
 * @example
 * ```ts
 * const adapter = r2NativeAdapter({
 *   client: s3Client,
 *   bucket: serverEnv.R2_BUCKET,
 *   publicUrl: serverEnv.CLOUDFLARE_R2_DELIVERY_URL,
 * })
 * ```
 */
export const r2NativeAdapter = (config: R2NativeConfig): Adapter => {
  const { client, bucket } = config

  return ({ prefix }) => ({
    name: 'r2-native',

    handleUpload: (async ({ data, file, req }) => {
      const filenamePreassigned = Boolean(req.context?.[R2_PREASSIGNED_FILENAME_CONTEXT_KEY])
      // When not preassigned by r2FilenameHook, generate the key here and (in
      // non-prod) prefix it so the asset is namespaced to this deployment. When
      // preassigned, the hook already applied the prefix.
      const finalFilename = filenamePreassigned
        ? file.filename
        : applyPreviewPrefix(generateR2Key(file.filename))

      applyFilename(file, data, req, finalFilename)

      const key = prefix ? `${prefix}/${finalFilename}` : finalFilename

      try {
        // Native Node Buffer works directly with the S3 SDK — no byte-copy
        // workaround needed (that was a Workers Buffer-polyfill quirk).
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimeType,
          }),
        )

        // When the filename was pre-assigned by r2FilenameHook, it's already
        // saved to the DB by the cloud-storage plugin's beforeChange hook.
        // Returning null skips the plugin's follow-up payload.update(), which
        // would otherwise run all field validators on a partial-data update and
        // fail required-field checks (title, thumbnail, frames) on new docs.
        if (filenamePreassigned) return
        return { filename: finalFilename }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[R2] Upload error:', key, error)
        throw error
      }
    }) as HandleUpload,

    handleDelete: async ({ filename }) => {
      // Preview isolation: a non-production deployment must never delete a
      // production object (cloned preview DBs reference real prod filenames,
      // which carry no preview marker). No-op in production.
      if (await shouldRefusePreviewDelete('R2', filename, () => isPreviewOwnedKey(filename))) {
        return
      }

      const key = prefix ? `${prefix}/${filename}` : filename
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      } catch (error) {
        // Using console.error because storage adapters don't have access to Payload's logger.
        // The adapter is initialized before Payload and doesn't receive req context.
        // eslint-disable-next-line no-console
        console.error('[R2] Delete error:', key, error)
        // Don't throw - deletion errors shouldn't break the app
      }
    },

    staticHandler: async (_req, { params }) => {
      const key = params.collection ? `${params.collection}/${params.filename}` : params.filename

      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))

        if (!object.Body) {
          return new Response('Not Found', { status: 404 })
        }

        // Return file with appropriate headers
        return new Response(object.Body.transformToWebStream(), {
          headers: {
            'Content-Type': object.ContentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
            ...(object.ETag ? { ETag: object.ETag } : {}),
          },
        })
      } catch (error) {
        // S3 returns NoSuchKey / 404 when the object is missing
        const httpStatus = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
          ?.httpStatusCode
        if ((error instanceof Error && error.name === 'NoSuchKey') || httpStatus === 404) {
          return new Response('Not Found', { status: 404 })
        }
        // eslint-disable-next-line no-console
        console.error('[R2] Static handler error:', key, error)
        return new Response('Internal Server Error', { status: 500 })
      }
    },
  })
}
