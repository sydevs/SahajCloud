/**
 * File upload validation utilities
 *
 * Provides centralized validation for file uploads to prevent abuse and ensure
 * uploads conform to expected constraints.
 */

/**
 * The ceiling on one whole multipart request, `upload.requestSizeLimit`.
 *
 * ⚠ `experimental.proxyClientMaxBodySize` in `next.config.mjs` must stay
 * STRICTLY above this, or the middleware truncates the body at the same byte
 * Payload would have refused it at, and the refusal becomes an opaque 500
 * (#938, #939).
 */
export const UPLOAD_REQUEST_SIZE_LIMIT = 52428800 // 50 MB, in bytes

/**
 * The ceiling on one file, `upload.limits.fileSize`. Under
 * `UPLOAD_REQUEST_SIZE_LIMIT` with room for the multipart boundary, part
 * headers and `_payload`, so a file this size still fits one request.
 */
export const UPLOAD_FILE_SIZE_LIMIT = 50331648 // 48 MB, in bytes

const megabytes = (bytes: number) => `${Math.floor(bytes / 1024 / 1024)} MB`

/**
 * What a refused oversized upload tells the caller.
 *
 * Two gates refuse one, and which fires is a race: the request counter is read
 * before each chunk reaches the parser, so a chunk that crosses both thresholds
 * trips the request gate even for a single file. Both therefore answer with this
 * one sentence — Payload's own wording names neither size (#939).
 */
export const UPLOAD_SIZE_LIMIT_MESSAGE = `Upload is too large. The limit is ${megabytes(UPLOAD_FILE_SIZE_LIMIT)} per file and ${megabytes(UPLOAD_REQUEST_SIZE_LIMIT)} per request.`

/**
 * Payload's message for a body over `requestSizeLimit`, thrown with a 413 from
 * `payload/dist/uploads/fetchAPI-multipart/processMultipart.js`. The per-file
 * gate beside it takes `responseOnLimit` from our config; this one takes
 * nothing, so it is recognised here instead.
 */
const PAYLOAD_REQUEST_SIZE_MESSAGE = 'Multipart request size limit has been reached'

/** Whether an error is Payload's unnamed refusal of an over-limit request body. */
export function isOversizedUploadError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { message, status } = error as { message?: unknown; status?: unknown }
  // 413 Payload Too Large, the status every multipart limit throws with.
  return status === 413 && message === PAYLOAD_REQUEST_SIZE_MESSAGE
}

/**
 * File size limits in bytes.
 *
 * ⚠ None may exceed `UPLOAD_FILE_SIZE_LIMIT`. These are checked in
 * `afterChange`, by which point the request limit has already refused a larger
 * body, so a higher number here can never fire.
 * `tests/unit/next-config-body-limit.spec.ts` pins that ordering.
 */
export const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10 MB for images
  video: 48 * 1024 * 1024, // 48 MB for videos
  audio: 48 * 1024 * 1024, // 48 MB for audio files
  document: 20 * 1024 * 1024, // 20 MB for documents
} as const

/** Allowed MIME types by category */
export const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
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
