import type { CollectionBeforeChangeHook } from 'payload'

type OrientationName = 'landscape' | 'portrait' | 'square'

/**
 * Detects image orientation from dimensions and returns the orientation name.
 * Uses 10% tolerance for square classification (ratio 0.9-1.1).
 */
function getOrientationFromDimensions(
  width: number,
  height: number,
): OrientationName {
  const ratio = width / height
  if (ratio > 1.1) return 'landscape'
  if (ratio < 0.9) return 'portrait'
  return 'square'
}

/**
 * Tags an uploaded image with its orientation, on create from the admin UI, the
 * API and imports alike.
 *
 * Dimensions come from `data`: Payload's `generateFileData` measures the buffer
 * before any `beforeChange` hook, and a magic-byte parser fed the raw upload can
 * hang on crafted bytes where a throw would have been caught (#780).
 *
 * SVG is skipped explicitly — Payload does measure it, off `width`/`height` or
 * `viewBox`, so declining the format is this hook's job now. The type checked is
 * the one the client declared, so the skip is a default, not a guarantee.
 */
export const detectOrientationHook: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
}) => {
  if (operation !== 'create' || !req.file) {
    return data
  }

  if (req.file.mimetype === 'image/svg+xml') {
    return data
  }

  const { width, height } = data
  if (typeof width !== 'number' || typeof height !== 'number' || !width || !height) {
    return data
  }

  const orientationName = getOrientationFromDimensions(width, height)
  const existingTags = Array.isArray(data.tags) ? (data.tags as string[]) : []

  return { ...data, tags: Array.from(new Set([...existingTags, orientationName])) }
}
