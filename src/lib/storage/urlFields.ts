import type { Field, FieldHook } from 'payload'

/**
 * Storage adapter type for URL generation
 */
type StorageAdapter = 'cloudflare-images' | 'r2'

/**
 * Options for creating a virtual URL field
 */
interface VirtualUrlFieldOptions {
  /**
   * The collection slug (used for development fallback URL)
   */
  collection: string
  /**
   * Storage adapter type ('cloudflare-images' or 'r2')
   * - cloudflare-images: Uses CLOUDFLARE_IMAGES_DELIVERY_URL
   * - r2: Uses CLOUDFLARE_R2_DELIVERY_URL
   */
  adapter: StorageAdapter
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
 * @example Cloudflare Images with transformations (for thumbnails)
 * ```typescript
 * fields: [
 *   createVirtualUrlField({
 *     collection: 'images',
 *     adapter: 'cloudflare-images',
 *     transformations: 'format=auto,width=320,height=320,fit=cover',
 *   }),
 * ]
 * ```
 *
 * @example Cloudflare Images without transformations (for SVG icons)
 * ```typescript
 * fields: [
 *   createVirtualUrlField({
 *     collection: 'meditation-tags',
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
