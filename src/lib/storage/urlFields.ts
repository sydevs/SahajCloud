import type { CollectionSlug, Field, FieldHook } from 'payload'

import { getCloudflareImagesUrl } from './cloudflareImagesAdapter'
import {
  getCloudflareStreamHlsUrl,
  getCloudflareStreamMp4Url,
  getCloudflareStreamThumbnailUrl,
} from './cloudflareStreamAdapter'
import { getMimeCategory } from './mimeUtils'
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
  /**
   * Field name containing the full file URL for fallback link (default: 'url')
   */
  fileUrlField?: string
}

/**
 * Options for creating a mixed media URL field (images, videos, and other files)
 */
interface MixedMediaUrlFieldOptions {
  /**
   * The collection slug (used for development fallback URL)
   */
  collection: CollectionSlug
}

/**
 * Options for the video-only virtual URL fields (`hlsUrlField`, `mp4UrlField`,
 * and the deprecated `streamUrlField`).
 */
interface VideoUrlFieldOptions {
  /**
   * The collection slug (used for development fallback URL)
   */
  collection: CollectionSlug
}

// ============================================================================
// Shared resolvers
// ============================================================================

/**
 * Returns the HLS manifest URL for video MIME types, `null` for everything else.
 *
 * Shared by `hlsUrlField` and the deprecated `streamUrlField` so both produce
 * identical values for the same upload.
 */
const buildHlsResolver = (collection: CollectionSlug): FieldHook => {
  return ({ data }) => {
    if (!data?.filename) return undefined

    const category = getMimeCategory(data.mimeType)

    if (category === 'video') {
      return (
        getCloudflareStreamHlsUrl(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
      )
    }

    return null
  }
}

/**
 * Returns the MP4 download URL for video MIME types, `null` for everything else.
 *
 * Used by `mp4UrlField`. Returns `null` for non-video so mixed-media
 * collections (`frames`, `files`) can expose a uniform `mp4Url` field.
 */
const buildVideoMp4Resolver = (collection: CollectionSlug): FieldHook => {
  return ({ data }) => {
    if (!data?.filename) return undefined

    const category = getMimeCategory(data.mimeType)

    if (category === 'video') {
      return (
        getCloudflareStreamMp4Url(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
      )
    }

    return null
  }
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
 *
 */
export const virtualUrlField = (options: VirtualUrlFieldOptions): Field => {
  const { collection, adapter } = options

  const afterReadHook: FieldHook = ({ data }) => {
    if (!data?.filename) return undefined

    if (adapter === 'cloudflare-images') {
      return getCloudflareImagesUrl(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
    }

    if (adapter === 'cloudflare-stream') {
      // Return MP4 download URL for direct file access
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
    admin: {
      hidden: true,
      description:
        adapter === 'cloudflare-stream'
          ? 'DEPRECATED: read `mp4Url` instead. Will be removed after the mobile-app cutover (#319).'
          : undefined,
    },
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
  const { collection, width = 320, height = 320, fileUrlField = 'url' } = options

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
        Cell: {
          path: '@/components/admin/ThumbnailCell/PreviewUrlThumbnailCell',
          serverProps: { fileUrlField },
        },
      },
    },
  }
}

/**
 * Creates a virtual URL field for mixed media collections (images, videos, and other files)
 *
 * Returns downloadable file URLs based on content type:
 * - Images: Cloudflare Images URL (full resolution)
 * - Videos: Cloudflare Stream MP4 download URL
 * - Other (PDFs, audio, etc.): R2 Storage URL
 *
 * @param options - Configuration for URL generation
 * @returns A Field configuration for the virtual URL field
 *
 * @example Frames collection
 * ```typescript
 * fields: [
 *   mixedMediaUrlField({
 *     collection: 'frames',
 *   }),
 * ]
 * ```
 *
 * @example Files collection
 * ```typescript
 * fields: [
 *   mixedMediaUrlField({
 *     collection: 'files',
 *   }),
 * ]
 * ```
 */
export const mixedMediaUrlField = (options: MixedMediaUrlFieldOptions): Field => {
  const { collection } = options

  const afterReadHook: FieldHook = ({ data }) => {
    if (!data?.filename) return undefined

    const category = getMimeCategory(data.mimeType)

    if (category === 'video') {
      // Return MP4 download URL for direct file access
      return (
        getCloudflareStreamMp4Url(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
      )
    }

    if (category === 'image') {
      return getCloudflareImagesUrl(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
    }

    // 'other' category (PDFs, audio, etc.) - use R2 URL or local fallback
    return getR2Url(data.filename) ?? getLocalFallbackUrl(collection, data.filename)
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
 * Creates a virtual HLS streaming URL field (`hlsUrl`).
 *
 * Returns the HLS manifest URL for video content, null otherwise. This is the
 * canonical name across the API; mount it on every collection that previously
 * used `streamUrlField`.
 */
export const hlsUrlField = (options: VideoUrlFieldOptions): Field => {
  const { collection } = options

  return {
    name: 'hlsUrl',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [buildHlsResolver(collection)],
    },
    admin: { hidden: true },
  }
}

/**
 * Creates a virtual MP4 download URL field (`mp4Url`).
 *
 * Returns the Cloudflare Stream MP4 download URL for video content, null
 * otherwise. Mount alongside `hlsUrlField` so consumers have a uniform name
 * for the MP4 across `videos` (where `url` is also MP4 but deprecated) and
 * mixed-media collections like `frames` and `files` (where `url` is the
 * generic file URL — image / R2 / MP4 by MIME).
 */
export const mp4UrlField = (options: VideoUrlFieldOptions): Field => {
  const { collection } = options

  return {
    name: 'mp4Url',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [buildVideoMp4Resolver(collection)],
    },
    admin: { hidden: true },
  }
}

/**
 * @deprecated Use `hlsUrlField` instead. Will be removed after the mobile-app
 * cutover (#319). Resolver behaviour is identical to `hlsUrlField`.
 */
export const streamUrlField = (options: VideoUrlFieldOptions): Field => {
  const { collection } = options

  return {
    name: 'streamUrl',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [buildHlsResolver(collection)],
    },
    admin: {
      hidden: true,
      description:
        'DEPRECATED: read `hlsUrl` instead. Will be removed after the mobile-app cutover (#319).',
    },
  }
}
