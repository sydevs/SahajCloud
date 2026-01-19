/**
 * Cloudflare API Utilities
 *
 * Handles deletion of assets from Cloudflare Images and Stream services.
 * Uses the standard Cloudflare API with rate limit handling.
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

interface CloudflareApiResponse<T> {
  success: boolean
  errors: Array<{ code: number; message: string }>
  messages: string[]
  result: T
  result_info?: {
    page?: number
    per_page?: number
    total_count?: number
    count?: number
    cursor?: string
  }
}

interface CloudflareImage {
  id: string
  filename: string
  uploaded: string
  requireSignedURLs: boolean
  variants: string[]
}

interface CloudflareVideo {
  uid: string
  created: string
  modified: string
  duration: number
  meta?: Record<string, unknown>
  status?: {
    state: string
    pctComplete?: string
  }
}

/**
 * Make a request to the Cloudflare API
 */
async function cfRequest<T>(
  path: string,
  apiToken: string,
  options: RequestInit = {},
): Promise<CloudflareApiResponse<T>> {
  const response = await fetch(`${CF_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Cloudflare API error ${response.status}: ${text}`)
  }

  return response.json()
}

/**
 * List all images with pagination
 */
async function listImages(
  accountId: string,
  apiToken: string,
  page = 1,
  perPage = 100,
): Promise<CloudflareImage[]> {
  const response = await cfRequest<{ images: CloudflareImage[] }>(
    `/accounts/${accountId}/images/v1?page=${page}&per_page=${perPage}`,
    apiToken,
  )

  return response.result?.images || []
}

/**
 * Delete a single image
 */
async function deleteImage(accountId: string, apiToken: string, imageId: string): Promise<boolean> {
  const encodedId = encodeURIComponent(imageId)
  const response = await cfRequest<Record<string, never>>(
    `/accounts/${accountId}/images/v1/${encodedId}`,
    apiToken,
    { method: 'DELETE' },
  )

  return response.success
}

/**
 * Delete all images from Cloudflare Images
 *
 * @returns Total number of deleted images
 */
export async function deleteAllCloudflareImages(
  accountId: string,
  apiToken: string,
  onProgress?: (deleted: number, message: string) => void,
): Promise<number> {
  let totalDeleted = 0
  let page = 1
  const perPage = 100

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const images = await listImages(accountId, apiToken, page, perPage)

    if (images.length === 0) {
      break
    }

    for (const image of images) {
      try {
        await deleteImage(accountId, apiToken, image.id)
        totalDeleted++

        if (onProgress && totalDeleted % 10 === 0) {
          onProgress(totalDeleted, `Deleted ${totalDeleted} images...`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        onProgress?.(totalDeleted, `Failed to delete image ${image.id}: ${message}`)
      }

      // Rate limit: ~4 requests/second to stay under 1200/5min
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    page++
  }

  return totalDeleted
}

/**
 * List all videos with cursor-based pagination
 */
async function listVideos(
  accountId: string,
  apiToken: string,
  cursor?: string,
  perPage = 1000,
): Promise<{ videos: CloudflareVideo[]; nextCursor?: string }> {
  let path = `/accounts/${accountId}/stream?per_page=${perPage}`
  if (cursor) {
    path += `&end=${cursor}`
  }

  const response = await cfRequest<CloudflareVideo[]>(path, apiToken)

  // Stream uses the last video's created time as cursor for pagination
  const videos = response.result || []
  const nextCursor = videos.length > 0 ? videos[videos.length - 1].created : undefined

  return { videos, nextCursor: videos.length === perPage ? nextCursor : undefined }
}

/**
 * Delete a single video
 */
async function deleteVideo(accountId: string, apiToken: string, videoId: string): Promise<boolean> {
  const response = await cfRequest<Record<string, never>>(
    `/accounts/${accountId}/stream/${videoId}`,
    apiToken,
    { method: 'DELETE' },
  )

  return response.success
}

/**
 * Delete all videos from Cloudflare Stream
 *
 * @returns Total number of deleted videos
 */
export async function deleteAllCloudflareVideos(
  accountId: string,
  apiToken: string,
  onProgress?: (deleted: number, message: string) => void,
): Promise<number> {
  let totalDeleted = 0
  let cursor: string | undefined

  do {
    const { videos, nextCursor } = await listVideos(accountId, apiToken, cursor)

    if (videos.length === 0) {
      break
    }

    for (const video of videos) {
      try {
        await deleteVideo(accountId, apiToken, video.uid)
        totalDeleted++

        if (onProgress && totalDeleted % 10 === 0) {
          onProgress(totalDeleted, `Deleted ${totalDeleted} videos...`)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        onProgress?.(totalDeleted, `Failed to delete video ${video.uid}: ${message}`)
      }

      // Rate limit: ~4 requests/second to stay under 1200/5min
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    cursor = nextCursor
  } while (cursor)

  return totalDeleted
}

/**
 * Count images in Cloudflare Images using the Stats endpoint
 */
export async function countCloudflareImages(accountId: string, apiToken: string): Promise<number> {
  const response = await cfRequest<{ count: { current: number; allowed: number } }>(
    `/accounts/${accountId}/images/v1/stats`,
    apiToken,
  )

  return response.result?.count?.current || 0
}

/**
 * Count videos in Cloudflare Stream
 */
export async function countCloudflareVideos(accountId: string, apiToken: string): Promise<number> {
  // Stream doesn't provide a direct count, so we fetch with minimal data
  const response = await cfRequest<CloudflareVideo[]>(
    `/accounts/${accountId}/stream?per_page=1`,
    apiToken,
  )

  // Stream's result_info.total_count gives us the count
  return response.result_info?.total_count || response.result?.length || 0
}
