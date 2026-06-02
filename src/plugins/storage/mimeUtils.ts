/**
 * MIME Type Utilities
 *
 * Shared utilities for MIME type classification used by both storage adapters
 * and URL field factories to ensure consistent routing logic.
 */

/**
 * Media category classification
 */
export type MimeCategory = 'image' | 'video' | 'other'

/**
 * Determine the media category for a given MIME type
 *
 * Used to route files to appropriate storage backends:
 * - 'image' → Cloudflare Images
 * - 'video' → Cloudflare Stream
 * - 'other' → R2 Storage (PDFs, audio, etc.)
 *
 * @param mimeType - The MIME type to classify (e.g., 'image/jpeg', 'video/mp4')
 * @returns The media category
 *
 * @example
 * ```typescript
 * getMimeCategory('image/jpeg')     // returns 'image'
 * getMimeCategory('video/mp4')      // returns 'video'
 * getMimeCategory('application/pdf') // returns 'other'
 * getMimeCategory('audio/mpeg')     // returns 'other'
 * getMimeCategory(undefined)        // returns 'other'
 * ```
 */
export function getMimeCategory(mimeType: string | undefined): MimeCategory {
  if (!mimeType) return 'other'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return 'other'
}
