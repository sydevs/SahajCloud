/**
 * Filename utilities for storage adapters.
 *
 * Generates URL-safe slugs from uploaded filenames, with a short random
 * suffix to avoid collisions in the underlying storage backend.
 */
import slugify from 'slugify'

const RANDOM_SUFFIX_LENGTH = 6

const buildSlug = (baseName: string): string => {
  // Fall back to "file" when slugify strips the entire base name (e.g.
  // all-Unicode input like "文件名"). Without this, the slug would start
  // with a hyphen, which Cloudflare Images may reject as a custom ID.
  const slugified = slugify(baseName, { strict: true, lower: true }) || 'file'
  // (Math.random() + 1) forces the integer part to 1, guaranteeing
  // toString(36) yields a long enough base36 expansion for the slice
  // below. Plain Math.random() can return values like 0.5 whose base36
  // form ("0.i") yields fewer than RANDOM_SUFFIX_LENGTH chars.
  const randomSuffix = (Math.random() + 1)
    .toString(36)
    .substring(2, 2 + RANDOM_SUFFIX_LENGTH)
  return `${slugified}-${randomSuffix}`
}

const splitExtension = (filename: string): { baseName: string; ext: string } => {
  const parts = filename.split('.')
  if (parts.length <= 1) return { baseName: filename, ext: '' }
  const ext = parts.pop() as string
  return { baseName: parts.join('.'), ext }
}

/**
 * Generate an R2 object key from an uploaded filename.
 *
 * Format: `<slug>-<random>.<ext>`
 * Example: `"My Audio File.mp3"` → `"my-audio-file-xk2j9s.mp3"`
 */
export const generateR2Key = (filename: string): string => {
  const { baseName, ext } = splitExtension(filename)
  const slug = buildSlug(baseName)
  return ext ? `${slug}.${ext}` : slug
}

/**
 * Generate a Cloudflare-Images-compatible custom ID from an uploaded filename.
 *
 * Format: `<slug>-<random>` (no extension — the ID appears verbatim in the
 * `imagedelivery.net` URL, which shouldn't carry a file extension).
 * Example: `"My Photo.jpg"` → `"my-photo-xk2j9s"`
 */
export const generateCloudflareImageId = (filename: string): string => {
  const { baseName } = splitExtension(filename)
  return buildSlug(baseName)
}

/**
 * Mirror a newly-assigned filename (and optional fileMetadata) onto the
 * in-memory `file`, `data`, and `req.file` objects.
 *
 * The persisted DB write happens via the storage adapter's return value
 * (see @payloadcms/plugin-cloud-storage afterChange hook). This helper
 * keeps the in-memory state consistent for downstream hooks that fire in
 * the same operation (beforeChange / afterRead / afterChange).
 */
export const applyFilename = (
  file: { filename: string },
  data: Record<string, unknown> | null | undefined,
  req: { file?: { name?: string } | null } | undefined,
  filename: string,
  fileMetadata?: Record<string, unknown>,
): void => {
  file.filename = filename
  if (data) {
    data.filename = filename
    if (fileMetadata !== undefined) {
      data.fileMetadata = fileMetadata
    }
  }
  if (req?.file) {
    req.file.name = filename
  }
}
