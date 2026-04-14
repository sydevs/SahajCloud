/**
 * Filename utilities for storage adapters.
 *
 * Generates URL-safe slugs from uploaded filenames, with a short random
 * suffix to avoid collisions in the underlying storage backend.
 */
import slugify from 'slugify'

const RANDOM_SUFFIX_LENGTH = 6

const buildSlug = (baseName: string): string => {
  const slugified = slugify(baseName, { strict: true, lower: true })
  const randomSuffix = Math.random()
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
