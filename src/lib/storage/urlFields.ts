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
 * Options for creating a thumbnail URL field
 */
interface ThumbnailUrlFieldOptions {
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
 *   createVirtualUrlField({
 *     collection: 'images',
 *     adapter: 'cloudflare-images',
 *   }),
 * ]
 * ```
 *
 * @example R2 Storage (for audio files)
 * ```typescript
 * fields: [
 *   createVirtualUrlField({
 *     collection: 'music',
 *     adapter: 'r2',
 *   }),
 * ]
 * ```
 */
export const createVirtualUrlField = (options: VirtualUrlFieldOptions): Field => {
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
 * Creates a virtual thumbnail URL field for mixed media collections
 *
 * Handles both image and video content:
 * - Images: Cloudflare Images with size transformations
 * - Videos: Cloudflare Stream thumbnail endpoint
 *
 * @param options - Configuration for thumbnail generation
 * @returns A Field configuration for the virtual thumbnail URL field
 *
 * @example Frames collection with 320x320 thumbnails
 * ```typescript
 * fields: [
 *   createThumbnailUrlField({
 *     collection: 'frames',
 *     width: 320,
 *     height: 320,
 *   }),
 * ]
 * ```
 */
export const createThumbnailUrlField = (options: ThumbnailUrlFieldOptions): Field => {
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
    name: 'thumbnailUrl',
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
 *   createStreamMp4UrlField({
 *     collection: 'frames',
 *   }),
 * ]
 * ```
 */
export const createStreamMp4UrlField = (options: StreamMp4UrlFieldOptions): Field => {
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

/**
 * Creates a virtual preview URL field that delegates to thumbnailUrl
 *
 * This is a convenience field that provides a consistent `previewUrl`
 * field name that uses the same logic as `thumbnailUrl`.
 *
 * @returns A Field configuration for the virtual preview URL field
 */
export const createPreviewUrlField = (): Field => {
  const afterReadHook: FieldHook = ({ data }) => {
    // Delegate to thumbnailUrl - this field exists for backward compatibility
    return data?.thumbnailUrl
  }

  return {
    name: 'previewUrl',
    type: 'text',
    virtual: true,
    hooks: {
      afterRead: [afterReadHook],
    },
    admin: { hidden: true },
  }
}
