/**
 * Cloudflare R2 storage adapter for PayloadCMS (S3 API).
 *
 * This adapter reads and writes R2 through the S3-compatible API (@aws-sdk/client-s3).
 * It points at the R2 endpoint `https://<accountId>.r2.cloudflarestorage.com`.
 * The app once used the Workers R2Bucket native binding. A Node host needs the S3 API instead.
 * Delivery domains (for example, assets.sydevelopers.com) stay the same.
 *
 * It also sanitizes every filename automatically, into a URL-safe slug with a unique suffix.
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
import { storageLogger } from './storageLogger'

/**
 * Return the R2 storage URL for a filename.
 * @returns The URL string, or undefined if the delivery URL is not set.
 */
export const getR2Url = (filename: string): string | undefined => {
  const deliveryUrl = serverEnv.CLOUDFLARE_R2_DELIVERY_URL
  if (!deliveryUrl) return undefined
  return `${deliveryUrl}/${filename}`
}

/**
 * Configuration for the R2 (S3 API) storage adapter.
 */
export interface R2NativeConfig {
  /** S3 client for the R2 S3 endpoint. */
  client: S3Client
  /** R2 bucket name. */
  bucket: string
  /** Public URL for R2 assets, for example "https://assets.sydevelopers.com". Empty in dev. */
  publicUrl: string
}

/**
 * Create the R2 storage adapter (S3-compatible API).
 *
 * It sanitizes every filename into a URL-safe slug with a random suffix.
 *
 * @param config - R2 (S3) configuration.
 * @returns A PayloadCMS storage adapter.
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
      // If r2FilenameHook preassigned the key, it already added the prefix.
      // Otherwise, generate the key here, and add a prefix in non-prod
      // so the asset is namespaced to this deployment.
      const finalFilename = filenamePreassigned
        ? file.filename
        : applyPreviewPrefix(generateR2Key(file.filename))

      applyFilename(file, data, req, finalFilename)

      const key = prefix ? `${prefix}/${finalFilename}` : finalFilename

      try {
        // The native Node Buffer works directly with the S3 SDK.
        // This code needs no byte-copy workaround. The old workaround fixed a Workers Buffer-polyfill quirk.
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimeType,
          }),
        )

        // If r2FilenameHook preassigned the filename, the beforeChange hook already saved it to the DB.
        // Returning null here skips the plugin's follow-up payload.update() call.
        // That update would otherwise run every field validator on a partial-data update.
        // On a new document, it would fail required-field checks such as title, thumbnail, and frames.
        if (filenamePreassigned) return
        return { filename: finalFilename }
      } catch (error) {
        storageLogger.error({ msg: 'R2 upload error', key, error })
        throw error
      }
    }) as HandleUpload,

    handleDelete: async ({ filename }) => {
      // Preview isolation: a non-production deployment must never delete a production object.
      // A cloned preview database references real prod filenames, and those carry no preview marker.
      // This check does nothing in production.
      if (await shouldRefusePreviewDelete('R2', filename, () => isPreviewOwnedKey(filename))) {
        return
      }

      const key = prefix ? `${prefix}/${filename}` : filename
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      } catch (error) {
        storageLogger.error({ msg: 'R2 delete error', key, error })
        // Do not throw here. A deletion error must not break the app.
      }
    },

    staticHandler: async (_req, { params }) => {
      const key = params.collection ? `${params.collection}/${params.filename}` : params.filename

      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))

        if (!object.Body) {
          return new Response('Not Found', { status: 404 })
        }

        return new Response(object.Body.transformToWebStream(), {
          headers: {
            'Content-Type': object.ContentType || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
            ...(object.ETag ? { ETag: object.ETag } : {}),
          },
        })
      } catch (error) {
        // S3 returns NoSuchKey or 404 when the object is missing.
        const httpStatus = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
          ?.httpStatusCode
        if ((error instanceof Error && error.name === 'NoSuchKey') || httpStatus === 404) {
          return new Response('Not Found', { status: 404 })
        }
        storageLogger.error({ msg: 'R2 static handler error', key, error })
        return new Response('Internal Server Error', { status: 500 })
      }
    },
  })
}
