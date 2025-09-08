/**
 * MinIO S3-compatible storage configuration for Payload CMS
 */
import { s3Storage } from '@payloadcms/storage-s3'
import type { CollectionOptions } from '@payloadcms/plugin-cloud-storage/types'
import { CollectionSlug } from 'payload'

const STORAGE_COLLECTIONS: CollectionSlug[] = ['media', 'music', 'frames', 'meditations']

/**
 * Create MinIO storage configuration for S3-compatible storage
 * Automatically configures based on environment variables
 */
export const storagePlugin = () => {
  // Check if storage configuration is available
  const endpoint = process.env.S3_ENDPOINT || ''
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || ''
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || ''
  const bucketName = process.env.S3_BUCKET || ''
  const isConfigured = Boolean(endpoint && accessKeyId && secretAccessKey && bucketName)

  return s3Storage({
    enabled: isConfigured,
    signedDownloads: true,
    collections: STORAGE_COLLECTIONS.reduce(
      (o, key) => ({ ...o, [key]: collectionStorageConfig(key) }),
      {},
    ),
    bucket: bucketName,
    config: {
      endpoint,
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true,
    },
  })
}

const collectionStorageConfig = (collection: CollectionSlug): Partial<CollectionOptions> => {
  return {
    prefix: collection,
    disableLocalStorage: true,
    disablePayloadAccessControl: process.env.S3_PUBLIC_ENDPOINT !== undefined ? true : undefined,
    generateFileURL: ({ filename, prefix }) => {
      return `https://${process.env.S3_PUBLIC_ENDPOINT}/${prefix}/${filename}`
    },
  }
}
