/**
 * File upload validation utilities
 *
 * Provides centralized validation for file uploads to prevent abuse and ensure
 * uploads conform to expected constraints.
 */

/**
 * File size limits in bytes
 */
export const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10 MB for images
  video: 500 * 1024 * 1024, // 500 MB for videos
  audio: 50 * 1024 * 1024, // 50 MB for audio files
  document: 20 * 1024 * 1024, // 20 MB for documents
} as const

/**
 * Allowed MIME types by category
 */
export const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'],
  document: ['application/pdf'],
} as const

export interface ValidationOptions {
  maxSize?: number
  allowedMimeTypes?: string[]
  category?: keyof typeof FILE_SIZE_LIMITS
}

export class FileValidationError extends Error {
  constructor(
    message: string,
    public readonly code: 'SIZE_EXCEEDED' | 'INVALID_MIME_TYPE' | 'INVALID_FILE',
  ) {
    super(message)
    this.name = 'FileValidationError'
  }
}

/**
 * Validate file upload
 *
 * @param file - File object with buffer, mimeType, and filename
 * @param options - Validation options
 * @throws {FileValidationError} If validation fails
 */
export function validateFileUpload(
  file: { buffer: Buffer; mimeType: string; filename: string },
  options: ValidationOptions = {},
): void {
  const { maxSize, allowedMimeTypes, category } = options

  // Determine max size from category or explicit value
  const effectiveMaxSize = maxSize ?? (category ? FILE_SIZE_LIMITS[category] : undefined)

  // Validate file size
  if (effectiveMaxSize && file.buffer.length > effectiveMaxSize) {
    const sizeMB = (file.buffer.length / (1024 * 1024)).toFixed(2)
    const maxSizeMB = (effectiveMaxSize / (1024 * 1024)).toFixed(2)
    throw new FileValidationError(
      `File size (${sizeMB} MB) exceeds maximum allowed size (${maxSizeMB} MB)`,
      'SIZE_EXCEEDED',
    )
  }

  // Determine allowed MIME types from category or explicit value
  const effectiveAllowedTypes =
    allowedMimeTypes ?? (category ? ALLOWED_MIME_TYPES[category] : undefined)

  // Validate MIME type
  if (effectiveAllowedTypes && !(effectiveAllowedTypes as readonly string[]).includes(file.mimeType)) {
    throw new FileValidationError(
      `File type '${file.mimeType}' is not allowed. Allowed types: ${(effectiveAllowedTypes as readonly string[]).join(', ')}`,
      'INVALID_MIME_TYPE',
    )
  }

  // Basic file integrity check
  if (!file.buffer || file.buffer.length === 0) {
    throw new FileValidationError('File is empty or corrupted', 'INVALID_FILE')
  }
}
