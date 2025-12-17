import type { Field, FieldHook } from 'payload'

import { getCloudflareImagesUrl } from './cloudflareImagesAdapter'
import {
  getCloudflareStreamMp4Url,
  getCloudflareStreamThumbnailUrl,
} from './cloudflareStreamAdapter'
import { getR2Url } from './r2NativeAdapter'

/**
 * Get local PayloadCMS fallback URL for development
 */
const getLocalFallbackUrl = (collection: string, filename: string): string =>
  `/api/${collection}/file/${filename}`

// ============================================================================
// Types
// ============================================================================

/**
 * Storage adapter type for URL generation
 */
type StorageAdapter = 'cloudflare-images' | 'cloudflare-stream' | 'r2'

/**
 * Options for creating a virtual URL field
 */
interface VirtualUrlFieldOptions {
  /**
   * The collection slug (used for development fallback URL)
   */
  collection: string
  /**
   * Storage adapter type
   * - cloudflare-images: Uses CLOUDFLARE_IMAGES_DELIVERY_URL
   * - cloudflare-stream: Uses CLOUDFLARE_STREAM_DELIVERY_URL
   * - r2: Uses CLOUDFLARE_R2_DELIVERY_URL
   */
  adapter: StorageAdapter
}

/**
 * Options for creating a preview URL field
 */
interface PreviewUrlFieldOptions {
  /**
   * The collection slug (used for development fallback URL)
   */
  collection: string
  /**
   * Width for thumbnail transformation (default: 320)
   */
  width?: number
  /**
   * Height for thumbnail transformation (default: 320)
   */
  height?: number
}

/**
 * Options for creating a Stream MP4 URL field
 */
interface StreamMp4UrlFieldOptions {
  /**
   * The collection slug - used only for development fallback URL when
   * CLOUDFLARE_STREAM_DELIVERY_URL is not configured. In production,
   * the collection is not needed since Stream URLs are ID-based.
   */
  collection: string
}

/**
 * Options for creating a frame URL field (mixed image/video content)
 */
interface FrameUrlFieldOptions {
  /**
   * The collection slug (used for development fallback URL)
   */
  collection: string
}

/**
 * Creates a virtual URL field for upload collections
 *
 * This utility generates a consistent virtual URL field that:
 * - Returns Cloudflare CDN URLs in production
 * - Falls back to PayloadCMS static file serving in development
 *
 * @param options - Configuration for URL generation
 * @returns A Field configuration for the virtual URL field
 *
 * @example Cloudflare Images (for image collections)
 * ```typescript
 * fields: [
 *   virtualUrlField({
 *     collection: 'images',
 *     adapter: 'cloudflare-images',
 *   }),
 * ]
 * ```
 *
 * @example R2 Storage (for audio files)
 * ```typescript
 * fields: [
 *   virtualUrlField({
 *     collection: 'music',
 *     adapter: 'r2',
 *   }),
 * ]
 * ```
 */
export const virtualUrlField = (options: VirtualUrlFieldOptions): Field => {
  const { collection, adapter } = options

  const afterReadHook: FieldHook = ({ data }) => {
    if (!data?.filename) return undefined

    if (adapter === 'cloudflare-images') {
      return getCloudflareImagesUrl(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
    }

    if (adapter === 'cloudflare-stream') {
      return (
        getCloudflareStreamMp4Url(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
      )
    }

    // R2 Storage - falls back to PayloadCMS-generated URL
    return getR2Url(data.filename) ?? data?.url
  }

  return {
    name: 'url',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [afterReadHook],
    },
    admin: { hidden: true },
  }
}

/**
 * Creates a virtual preview URL field for mixed media collections
 *
 * Handles both image and video content:
 * - Images: Cloudflare Images with size transformations
 * - Videos: Cloudflare Stream thumbnail endpoint
 *
 * @param options - Configuration for preview/thumbnail generation
 * @returns A Field configuration for the virtual preview URL field
 *
 * @example Frames collection with 320x320 previews
 * ```typescript
 * fields: [
 *   previewUrlField({
 *     collection: 'frames',
 *     width: 320,
 *     height: 320,
 *   }),
 * ]
 * ```
 */
export const previewUrlField = (options: PreviewUrlFieldOptions): Field => {
  const { collection, width = 320, height = 320 } = options

  const afterReadHook: FieldHook = ({ data }) => {
    if (!data?.filename) return undefined

    if (data.mimeType?.startsWith('video/')) {
      return (
        getCloudflareStreamThumbnailUrl(data.filename, height) ??
        getLocalFallbackUrl(collection, data.filename)
      )
    }

    if (data.mimeType?.startsWith('image/')) {
      const variant = `format=auto,width=${width},height=${height},fit=cover`
      return (
        getCloudflareImagesUrl(data.filename, variant) ??
        getLocalFallbackUrl(collection, data.filename)
      )
    }

    // Fallback for unknown MIME types
    return getLocalFallbackUrl(collection, data.filename)
  }

  return {
    name: 'previewUrl',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [afterReadHook],
    },
    admin: {
      hidden: true,
      components: {
        Cell: '@/components/admin/ThumbnailCell',
      },
    },
  }
}

/**
 * Creates a virtual Stream MP4 URL field for video content
 *
 * Generates MP4 download URLs for Cloudflare Stream videos.
 * Only returns a URL when the content is a video.
 *
 * @param options - Configuration for MP4 URL generation
 * @returns A Field configuration for the virtual MP4 URL field
 *
 * @example Frames collection
 * ```typescript
 * fields: [
 *   streamMp4UrlField({
 *     collection: 'frames',
 *   }),
 * ]
 * ```
 */
export const streamMp4UrlField = (options: StreamMp4UrlFieldOptions): Field => {
  const { collection } = options

  const afterReadHook: FieldHook = ({ data }) => {
    if (!data?.mimeType?.startsWith('video/') || !data?.filename) {
      return undefined
    }

    return (
      getCloudflareStreamMp4Url(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
    )
  }

  return {
    name: 'streamMp4Url',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [afterReadHook],
    },
    admin: {
      readOnly: true,
      description: 'Direct MP4 URL for HTML5 video playback',
      condition: (data) => data?.mimeType?.startsWith('video/'),
    },
  }
}

/**
 * Creates a virtual URL field for mixed media collections (images and videos)
 *
 * Returns full resolution URLs based on content type:
 * - Images: Cloudflare Images URL (full resolution)
 * - Videos: Cloudflare Stream MP4 download URL
 *
 * @param options - Configuration for URL generation
 * @returns A Field configuration for the virtual URL field
 *
 * @example Frames collection
 * ```typescript
 * fields: [
 *   frameUrlField({
 *     collection: 'frames',
 *   }),
 * ]
 * ```
 */
export const frameUrlField = (options: FrameUrlFieldOptions): Field => {
  const { collection } = options

  const afterReadHook: FieldHook = ({ data }) => {
    if (!data?.filename) return undefined

    if (data.mimeType?.startsWith('video/')) {
      return (
        getCloudflareStreamMp4Url(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
      )
    }

    if (data.mimeType?.startsWith('image/')) {
      return getCloudflareImagesUrl(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
    }

    // Fallback for unknown MIME types
    return getLocalFallbackUrl(collection, data.filename)
  }

  return {
    name: 'url',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [afterReadHook],
    },
    admin: { hidden: true },
  }
}
