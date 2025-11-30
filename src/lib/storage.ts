/**
 * MinIO S3-compatible storage configuration for Payload CMS
 */
import type { CollectionOptions } from '@payloadcms/plugin-cloud-storage/types'

import { s3Storage } from '@payloadcms/storage-s3'
import { CollectionSlug } from 'payload'

const STORAGE_COLLECTIONS: CollectionSlug[] = ['media', 'music', 'frames', 'meditations', 'file-attachments']

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
    disableLocalStorage: process.env.PUBLIC_ASSETS_URL !== undefined,
    disablePayloadAccessControl: process.env.PUBLIC_ASSETS_URL !== undefined ? true : undefined,
    generateFileURL: ({ filename, prefix }) => {
      return `https://${process.env.PUBLIC_ASSETS_URL}/${prefix}/${filename}`
    },
  }
}
