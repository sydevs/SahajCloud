import {
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
} from 'payload'
import { PayloadRequest } from 'payload'
import slugify from 'slugify'

import { extractFileMetadata } from './fileUtils'

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

