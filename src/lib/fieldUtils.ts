// import fs from 'fs' // DISABLED: Only needed for video thumbnail generation (disabled)

import {
  CollectionAfterChangeHook,
  CollectionAfterReadHook,
  CollectionBeforeChangeHook,
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
} from 'payload'
import { PayloadRequest } from 'payload'
// import sharp from 'sharp' // DISABLED: Incompatible with Cloudflare Workers - TODO: Migrate to Cloudflare Images (Phase 6)
import slugify from 'slugify'
// import tmp from 'tmp' // DISABLED: Only needed for video thumbnail generation (disabled)

import { extractFileMetadata } from './fileUtils'
// import { extractVideoThumbnail } from './fileUtils' // DISABLED: Function disabled for Cloudflare Workers
import { logger } from './logger'

type FileType = 'image' | 'audio' | 'video'

// Maximum MBs for different file types
const MAX_FILE_SIZE = {
  image: 10,
  audio: 50,
  video: 100,
}

// Maximum seconds for different file types
const MAX_FILE_DURATION = {
  image: Infinity, // not applicable
  audio: 50,
  video: 62,
}

type ProcessFileHook = ({
  maxMB,
  maxMinutes,
}: {
  maxMB?: number
  maxMinutes?: number
}) => CollectionBeforeValidateHook

/**
 * Sanitize uploaded file names for safe storage
 *
 * Converts file names to URL-safe slugs and adds random suffix to prevent collisions.
 * This hook should be added to the `beforeOperation` hook array of upload collections.
 *
 * @param params - Hook parameters
 * @param params.req - Payload request object containing the uploaded file
 *
 * @remarks
 * **Transformation Process:**
 * 1. Extract filename and extension
 * 2. Slugify filename (lowercase, URL-safe, strict mode)
 * 3. Add random 6-character suffix
 * 4. Preserve original file extension
 *
 * **Benefits:**
 * - Prevents special characters in filenames
 * - Avoids filename collisions with random suffix
 * - Creates URL-friendly filenames
 * - Maintains file extension for MIME type detection
 *
 * @example
 * Input filename: "My Photo (1).jpg"
 * Output filename: "my-photo-1-xk2j9s.jpg"
 *
 * @example
 * Usage in collection config
 * ```typescript
 * export const Media: CollectionConfig = {
 *   slug: 'media',
 *   upload: true,
 *   hooks: {
 *     beforeOperation: [sanitizeFilename]
 *   }
 * }
 * ```
 */
export const sanitizeFilename: CollectionBeforeOperationHook = async ({
  req,
}: {
  req: PayloadRequest
}) => {
  const file = req.file
  if (typeof file?.name === 'string') {
    const fileName = file.name.split('.', 2)

    file.name =
      slugify(fileName[0], { strict: true, lower: true }) +
      '-' +
      (Math.random() + 1).toString(36).substring(2) +
      '.' +
      fileName[1]
  }
}

/**
 * Create a file validation and metadata extraction hook for upload collections
 *
 * Returns a `beforeValidate` hook that validates file size and duration, then extracts
 * and stores metadata (dimensions, duration, codec info) in the document's `fileMetadata` field.
 *
 * @param params - Configuration options
 * @param params.maxMB - Maximum file size in megabytes (optional, defaults based on file type)
 * @param params.maxMinutes - Maximum file duration in minutes (optional, defaults based on file type)
 *
 * @returns CollectionBeforeValidateHook that validates and processes uploaded files
 *
 * @throws Error if file size exceeds the maximum allowed size for the file type
 * @throws Error if file duration exceeds the maximum allowed duration for the file type
 *
 * @remarks
 * **Default Limits:**
 * - Images: 10MB max size, no duration limit
 * - Audio: 50MB max size, 50 minutes max duration
 * - Video: 100MB max size, 62 minutes max duration
 *
 * **Metadata Extraction:**
 * - Images: Width, height, format, color space
 * - Audio/Video: Duration, codec, bitrate, sample rate
 *
 * **Validation Order:**
 * 1. Check file size against maxMB limit
 * 2. Extract file metadata using ffprobe (audio/video) or Sharp (images)
 * 3. Check duration against maxMinutes limit (if applicable)
 *
 * @example
 * Default limits based on file type
 * ```typescript
 * export const Meditations: CollectionConfig = {
 *   slug: 'meditations',
 *   upload: true,
 *   hooks: {
 *     beforeValidate: [processFile({})] // Uses defaults: 50MB, 50 minutes
 *   }
 * }
 * ```
 *
 * @example
 * Custom limits for specific requirements
 * ```typescript
 * export const Music: CollectionConfig = {
 *   slug: 'music',
 *   upload: true,
 *   hooks: {
 *     beforeValidate: [processFile({ maxMB: 100, maxMinutes: 120 })]
 *   }
 * }
 * ```
 */
export const processFile: ProcessFileHook = ({ maxMB, maxMinutes }) => {
  return async ({ data, req }) => {
    if (!req.file || !req.file.data) {
      return data
    }

    const { mimetype } = req.file
    const fileType = mimetype.split('/', 1)[0] as FileType
    maxMB ||= MAX_FILE_SIZE[fileType]
    maxMinutes ||= MAX_FILE_DURATION[fileType]

    // Validate file size
    const fileSize = req.file.size / 1024 / 1024 || 0
    if (req.file.size > maxMB * 1024 * 1024) {
      throw new Error(
        `File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of ${maxMB}MB`,
      )
    }

    // Extract meta data
    const metadata = await extractFileMetadata(req.file)
    data ||= {}
    data.fileMetadata = metadata

    // Validate duration
    if (metadata && maxMinutes !== Infinity) {
      const duration = metadata.duration || 0
      const maxSeconds = maxMinutes * 60

      if (duration > maxSeconds) {
        throw new Error(
          `Duration (${Math.round(duration / 60)} minutes) exceeds maximum allowed duration of ${maxMinutes} minutes`,
        )
      }
    }

    return data
  }
}

/**
 * Convert and optimize uploaded image files before storage
 *
 * DISABLED: This hook is temporarily disabled for Cloudflare Workers compatibility.
 * Sharp library requires native binaries and multi-threading which are not supported
 * in Cloudflare Workers runtime.
 *
 * TODO: Migrate to Cloudflare Images API in Phase 6 for image processing:
 * - Image dimension extraction
 * - WebP conversion
 * - Image optimization
 *
 * Original functionality:
 * - Extracts width and height using Sharp library
 * - Stores dimensions in `data.dimensions` field as `{ width, height }`
 * - Auto-converts JPEG and PNG to WebP at 95% quality
 * - Updates file buffer, mimetype, and filename after conversion
 */
export const convertFile: CollectionBeforeChangeHook = async ({ data }) => {
  // DISABLED: Sharp processing removed for Cloudflare Workers compatibility
  // Image processing will be handled by Cloudflare Images API in Phase 6
  return data
}

/*
// ORIGINAL IMPLEMENTATION - Commented out for Cloudflare Workers compatibility
export const convertFile: CollectionBeforeChangeHook = async ({ data, req }) => {
  if (req.file && req.file.data && req.file.mimetype) {
    const { mimetype } = req.file

    if (mimetype.startsWith('image/')) {
      // For images, extract dimensions using Sharp
      const { width, height } = await sharp(req.file.data).metadata()
      if (width && height) {
        data.dimensions = { width, height }
      }

      // Auto-convert JPG to WEBP at 95% quality (similar to Media collection)
      if (mimetype === 'image/jpeg' || mimetype === 'image/png') {
        const webpBuffer = await sharp(req.file.data).webp({ quality: 95 }).toBuffer()

        // Update the file data
        req.file.data = webpBuffer
        req.file.mimetype = 'image/webp'
        req.file.name = req.file.name.replace(/\.(jpe?g|png)$/i, '.webp')
      }
    }
  }

  return data
}
*/

/**
 * Automatically generate thumbnails for uploaded video files
 *
 * DISABLED: This hook is temporarily disabled for Cloudflare Workers compatibility.
 * The extractVideoThumbnail function uses Sharp library which requires native binaries
 * and multi-threading not supported in Cloudflare Workers runtime.
 *
 * TODO: Migrate to Cloudflare Images API or Cloudflare Stream API in Phase 6 for:
 * - Video thumbnail extraction
 * - Image processing and optimization
 *
 * Original functionality:
 * - Extracts frame at 0.1 seconds using FFmpeg
 * - Converts to 320x320 WebP format using Sharp
 * - Creates FileAttachment with ownership for cascade deletion
 */
export const generateVideoThumbnailHook: CollectionAfterChangeHook = async ({ doc }) => {
  // DISABLED: Video thumbnail generation removed for Cloudflare Workers compatibility
  // Video thumbnails will be handled by Cloudflare Stream or Images API in Phase 6
  return doc
}

/*
// ORIGINAL IMPLEMENTATION - Commented out for Cloudflare Workers compatibility
export const generateVideoThumbnailHook: CollectionAfterChangeHook = async ({
  doc,
  req,
  operation,
  collection,
}) => {
  if (operation !== 'create' || !doc.mimeType?.startsWith('video/') || !req.file?.data) {
    return doc
  }

  try {
    // Convert Buffer to Uint8Array for better compatibility with file-type library
    // Always create a new Uint8Array to ensure proper type conversion
    const data = req.file.data as Buffer | Uint8Array | ArrayBuffer
    const fileData = Buffer.isBuffer(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data)
    const thumbnailBuffer = await extractVideoThumbnail(fileData)
    const tmpFile = tmp.fileSync({ postfix: '.webp' })
    fs.writeFileSync(tmpFile.fd, thumbnailBuffer)

    // Create FileAttachment instead of Media
    const thumbnailAttachment = await req.payload.create({
      collection: 'file-attachments',
      data: {
        owner: {
          relationTo: collection.slug as 'lessons' | 'frames',
          value: doc.id,
        },
      },
      filePath: tmpFile.name,
    })

    const updatedDoc = await req.payload.update({
      collection: 'frames',
      id: doc.id,
      data: {
        thumbnail: thumbnailAttachment.id,
      },
    })

    // Clean up temp file
    tmpFile.removeCallback()

    return updatedDoc
  } catch (error) {
    logger.warn('Failed to generate video thumbnail', {
      frameId: doc.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return doc
  }
}
*/

/**
 * Set preview URL for media documents based on file type and available thumbnails
 *
 * Dynamically populates the `previewUrl` field with the most appropriate image URL for
 * admin interface display. Handles video thumbnails, image sizes, and fallback URLs with
 * graceful error handling for missing references.
 *
 * @param params - Hook parameters
 * @param params.doc - Document being read from database
 * @param params.req - Payload request object for making additional queries
 *
 * @returns Document with `previewUrl` field populated, or original doc if no preview available
 *
 * @remarks
 * **Priority Order for Preview URL:**
 *
 * **For Videos:**
 * 1. Video thumbnail (from FileAttachment relationship)
 * 2. If thumbnail is unpopulated (string ID), fetch it from file-attachments collection
 * 3. If thumbnail is already populated (object), use its URL directly
 * 4. If no thumbnail available, previewUrl remains undefined (no fallback to video URL)
 *
 * **For Images:**
 * 1. Small size variant (if available via `doc.sizes.small.url`)
 * 2. Original image URL (fallback if no small size exists)
 *
 * **Graceful Error Handling:**
 * - If thumbnail reference is invalid or deleted, logs warning and continues
 * - Common during collection resets or data migrations
 * - Does not throw errors, ensuring read operations always succeed
 *
 * **Admin Interface Benefits:**
 * - Fast loading preview images in admin lists
 * - Consistent thumbnail display for videos
 * - Optimized bandwidth usage with small image sizes
 *
 * @example
 * Usage in Frames collection
 * ```typescript
 * export const Frames: CollectionConfig = {
 *   slug: 'frames',
 *   upload: true,
 *   hooks: {
 *     afterRead: [setPreviewUrlHook]
 *   }
 * }
 * ```
 *
 * @example
 * Video frame with thumbnail
 * ```typescript
 * // Input document
 * {
 *   id: 'frame-123',
 *   mimeType: 'video/mp4',
 *   url: '/media/meditation-video.mp4',
 *   thumbnail: 'attachment-456' // Unpopulated reference
 * }
 *
 * // After hook execution
 * {
 *   id: 'frame-123',
 *   mimeType: 'video/mp4',
 *   url: '/media/meditation-video.mp4',
 *   thumbnail: 'attachment-456',
 *   previewUrl: '/media/video-thumbnail.webp' // ← Added by hook
 * }
 * ```
 *
 * @example
 * Image with size variants
 * ```typescript
 * // Input document
 * {
 *   id: 'image-789',
 *   mimeType: 'image/webp',
 *   url: '/media/photo-1920x1080.webp',
 *   sizes: {
 *     small: { url: '/media/photo-320x180.webp' }
 *   }
 * }
 *
 * // After hook execution - previewUrl set to small size
 * {
 *   ...
 *   previewUrl: '/media/photo-320x180.webp' // ← Uses small size
 * }
 * ```
 */
export const setPreviewUrlHook: CollectionAfterReadHook = async ({ doc, req }) => {
  if (!doc) return doc

  // For video frames, use thumbnail if available
  if (doc.mimeType?.startsWith('video/') && doc.thumbnail) {
    // If thumbnail is just an ID, we need to populate it
    if (typeof doc.thumbnail === 'string') {
      try {
        const thumbnailDoc = await req.payload.findByID({
          collection: 'file-attachments',
          id: doc.thumbnail,
        })
        if (thumbnailDoc?.url) {
          doc.previewUrl = thumbnailDoc.url
          return doc
        }
      } catch (error) {
        // Thumbnail not found (e.g., deleted or invalid reference), skip gracefully
        // This can happen during collection resets or data migration
        logger.warn('Thumbnail reference not found for frame', {
          frameId: doc.id,
          thumbnailId: doc.thumbnail,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else if (typeof doc.thumbnail === 'object' && doc.thumbnail?.url) {
      doc.previewUrl = doc.thumbnail.url
      return doc
    }
  }

  // For images or fallback, use small size if available
  if (doc.sizes?.small?.url) {
    doc.previewUrl = doc.sizes.small.url
  } else {
    // Final fallback to main URL (but only for images, not videos)
    if (!doc.mimeType?.startsWith('video/')) {
      doc.previewUrl = doc.url
    }
  }

  return doc
}
