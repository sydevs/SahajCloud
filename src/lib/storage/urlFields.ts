import type { CollectionSlug, Field, FieldHook } from 'payload'

import { getCloudflareImagesUrl } from './cloudflareImagesAdapter'
import {
  getCloudflareStreamMp4Url,
  getCloudflareStreamThumbnailUrl,
} from './cloudflareStreamAdapter'
import { getR2Url } from './r2NativeAdapter'

/**
 * Get local PayloadCMS fallback URL for development
 */
const getLocalFallbackUrl = (collection: CollectionSlug, filename: string): string =>
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
  collection: CollectionSlug
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
  collection: CollectionSlug
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
 * Options for creating a frame URL field (mixed image/video content)
 */
interface FrameUrlFieldOptions {
  /**
   * The collection slug (used for development fallback URL)
   */
  collection: CollectionSlug
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
      // Return undefined if Cloudflare Stream is not configured
      // Components should fall back to <video> element with preload="metadata"
      return getCloudflareStreamThumbnailUrl(data.filename, height) ?? undefined
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
        Cell: '@/components/admin/ThumbnailCell/PreviewUrlThumbnailCell',
      },
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
