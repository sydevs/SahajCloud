/**
 * R2 Client Utilities
 *
 * Handles bulk deletion of objects from Cloudflare R2 buckets using the S3-compatible API.
 * Uses DeleteObjectsCommand for batch deletion (up to 1000 objects per request).
 */

import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type _Object,
} from '@aws-sdk/client-s3'

export interface R2ClientConfig {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
}

/**
 * Create an S3 client configured for Cloudflare R2
 */
export function createR2Client(config: R2ClientConfig): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.eu.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })
}

/**
 * List all objects in an R2 bucket with pagination
 */
async function* listAllObjects(client: S3Client, bucket: string): AsyncGenerator<_Object[]> {
  let continuationToken: string | undefined

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    })

    const response = await client.send(command)

    if (response.Contents && response.Contents.length > 0) {
      yield response.Contents
    }

    continuationToken = response.NextContinuationToken
  } while (continuationToken)
}

/**
 * Delete all objects from an R2 bucket using batch deletion
 *
 * @returns Total number of deleted objects
 */
export async function deleteAllR2Objects(
  client: S3Client,
  bucket: string,
  onProgress?: (deleted: number, message: string) => void,
): Promise<number> {
  let totalDeleted = 0

  for await (const objects of listAllObjects(client, bucket)) {
    // DeleteObjects can handle up to 1000 objects per request
    const command = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objects.map((obj) => ({ Key: obj.Key })),
        Quiet: true, // Don't return individual deletion results
      },
    })

    try {
      const response = await client.send(command)

      // Count successfully deleted objects
      const deletedCount = objects.length - (response.Errors?.length || 0)
      totalDeleted += deletedCount

      if (onProgress) {
        onProgress(totalDeleted, `Deleted ${totalDeleted} objects from ${bucket}...`)
      }

      // Log any errors
      if (response.Errors && response.Errors.length > 0) {
        for (const error of response.Errors) {
          onProgress?.(totalDeleted, `  Error deleting ${error.Key}: ${error.Message}`)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      onProgress?.(totalDeleted, `Batch delete failed: ${message}`)
      throw error
    }
  }

  return totalDeleted
}

/**
 * Count objects in an R2 bucket
 *
 * @returns Total number of objects
 */
export async function countR2Objects(client: S3Client, bucket: string): Promise<number> {
  let total = 0

  for await (const objects of listAllObjects(client, bucket)) {
    total += objects.length
  }

  return total
}
