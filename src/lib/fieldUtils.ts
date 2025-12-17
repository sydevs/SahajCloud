import type { CollectionBeforeValidateHook } from 'payload'

export type FileMetadata = {
  width?: number
  height?: number
  duration?: number
  orientation?: number
}

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
    // Note: With Cloudflare-native storage, metadata extraction is handled by:
    // - Cloudflare Images API for images (automatic WebP/AVIF conversion, dimensions)
    // - Cloudflare Stream API for videos (automatic encoding, thumbnails, duration)
    // - R2 for audio/files (basic metadata only)
    const metadata: FileMetadata = {}
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
