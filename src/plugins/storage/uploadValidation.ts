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
 * STRICTLY above this. `DEPLOYMENT.md` carries what an equal cap costs
 * (#938, #939).
 */
export const UPLOAD_REQUEST_SIZE_LIMIT = 50 * 1024 * 1024

/**
 * The ceiling on one file, `upload.limits.fileSize`. The gap below
 * `UPLOAD_REQUEST_SIZE_LIMIT` is what the multipart boundary, the part headers
 * and `_payload` ride in, so a file this size still fits one request.
 */
export const UPLOAD_FILE_SIZE_LIMIT = 48 * 1024 * 1024

/** Bytes as megabytes, for a size-limit message. */
const megabytes = (bytes: number) => `${+(bytes / 1024 ** 2).toFixed(2)} MB`

/**
 * Either ceiling answers with this one sentence, because either can be the one
 * that fires. Measured on a dev server: a 60 MB file is refused by the request
 * gate, a 49 MB file by the per-file gate — the request counter is read before
 * a chunk reaches the parser, so a large enough chunk crosses the request
 * ceiling before the per-file gate has seen the bytes. Payload's own wording
 * names neither size (#939).
 */
export const UPLOAD_SIZE_LIMIT_MESSAGE = `Upload is too large. The limit is ${megabytes(UPLOAD_FILE_SIZE_LIMIT)} per file and ${megabytes(UPLOAD_REQUEST_SIZE_LIMIT)} per request.`

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

/** What each refusal answers with, so the message it carries reaches the caller. */
const STATUS_BY_CODE = {
  SIZE_EXCEEDED: 413,
  INVALID_MIME_TYPE: 415,
  INVALID_FILE: 400,
} as const

/**
 * A refusal the caller caused, and has to be told about.
 *
 * ⚠ The `status` is load-bearing, not decoration. These are thrown from an
 * adapter's `handleUpload`, so they reach `routeError`, which asks
 * `isErrorPublic`: an error carrying no status defaults to 500, and a 500 has
 * its whole body replaced with "Something went wrong." Every category limit is
 * well under `UPLOAD_FILE_SIZE_LIMIT`, so this is the gate a 12 MB image
 * actually hits, and the message naming both sizes was being discarded (#939).
 */
export class FileValidationError extends Error {
  readonly status: number

  constructor(
    message: string,
    public readonly code: keyof typeof STATUS_BY_CODE,
  ) {
    super(message)
    this.name = 'FileValidationError'
    this.status = STATUS_BY_CODE[code]
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
    throw new FileValidationError(
      `File size (${megabytes(file.buffer.length)}) exceeds maximum allowed size (${megabytes(effectiveMaxSize)})`,
      'SIZE_EXCEEDED',
    )
  }

  // Determine allowed MIME types from category or explicit value
  const effectiveAllowedTypes =
    allowedMimeTypes ?? (category ? ALLOWED_MIME_TYPES[category] : undefined)

  // Validate MIME type
  if (
    effectiveAllowedTypes &&
    !(effectiveAllowedTypes as readonly string[]).includes(file.mimeType)
  ) {
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
