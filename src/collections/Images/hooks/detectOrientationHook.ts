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
 * Hook that detects image orientation and automatically adds the corresponding tag.
 *
 * Runs on all image uploads (admin UI, API, imports).
 * Orientation tags: landscape, portrait, square
 *
 * - landscape: width > height (ratio > 1.1)
 * - portrait: height > width (ratio < 0.9)
 * - square: width ≈ height (ratio 0.9-1.1, 10% tolerance)
 *
 * Dimensions come from `data`, never from `req.file.data`. Payload's
 * `generateFileData` measures the buffer before any `beforeChange` hook runs, so
 * parsing it a second time here only widens the attack surface: a magic-byte
 * parser picks its format from attacker-controlled bytes, and a hang in one of
 * them pins the event loop where a throw would have been caught (#780).
 *
 * SVG images are skipped as they don't have meaningful pixel dimensions. Payload
 * does measure them, off the `width`/`height` or `viewBox` attributes, so the
 * skip has to be explicit here.
 */
export const detectOrientationHook: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
}) => {
  if (operation !== 'create' || !req.file?.data) {
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
