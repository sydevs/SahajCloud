import type { Field, FieldHook } from 'payload'

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
      // Generate Cloudflare Images URL if in production with credentials
      const deliveryUrl = process.env.CLOUDFLARE_IMAGES_DELIVERY_URL
      if (deliveryUrl) {
        return `${deliveryUrl}/${data.filename}/`
      }
      // Fallback to PayloadCMS static file serving in development
      return `/api/${collection}/file/${data.filename}`
    }

    if (adapter === 'cloudflare-stream') {
      // Generate Cloudflare Stream URL if in production with credentials
      const deliveryUrl = process.env.CLOUDFLARE_STREAM_DELIVERY_URL
      if (deliveryUrl) {
        return `${deliveryUrl}/${data.filename}/downloads/default.mp4`
      }
      // Fallback to PayloadCMS static file serving in development
      return `/api/${collection}/file/${data.filename}`
    }

    // R2 Storage
    if (data.filename && process.env.CLOUDFLARE_R2_DELIVERY_URL) {
      return `${process.env.CLOUDFLARE_R2_DELIVERY_URL}/${data.filename}`
    }
    // Fallback to PayloadCMS-generated URL (local storage in development)
    return data?.url
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
      // Cloudflare Stream thumbnail
      const deliveryUrl = process.env.CLOUDFLARE_STREAM_DELIVERY_URL
      if (deliveryUrl) {
        return `${deliveryUrl}/${data.filename}/thumbnails/thumbnail.jpg?height=${height}`
      }
      // Fallback to PayloadCMS static file serving for videos
      return `/api/${collection}/file/${data.filename}`
    } else if (data.mimeType?.startsWith('image/')) {
      // Cloudflare Images thumbnail with transformations
      const deliveryUrl = process.env.CLOUDFLARE_IMAGES_DELIVERY_URL
      if (deliveryUrl) {
        return `${deliveryUrl}/${data.filename}/format=auto,width=${width},height=${height},fit=cover`
      }
      // Fallback to PayloadCMS static file serving for images
      return `/api/${collection}/file/${data.filename}`
    }

    // Fallback for unknown MIME types
    return `/api/${collection}/file/${data.filename}`
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

    // Cloudflare Stream MP4 download URL
    const deliveryUrl = process.env.CLOUDFLARE_STREAM_DELIVERY_URL
    if (deliveryUrl) {
      return `${deliveryUrl}/${data.filename}/downloads/default.mp4`
    }

    // Fallback to PayloadCMS static file serving
    return `/api/${collection}/file/${data.filename}`
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

