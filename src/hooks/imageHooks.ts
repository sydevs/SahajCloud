import type { CollectionBeforeChangeHook } from 'payload'

import imageSize from 'image-size'

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
 * SVG images are skipped as they don't have meaningful pixel dimensions.
 */
export const detectOrientationHook: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
}) => {
  // Only run on create operations with file uploads
  if (operation !== 'create' || !req.file?.data) {
    return data
  }

  // Skip SVGs (no meaningful pixel dimensions)
  if (req.file.mimetype === 'image/svg+xml') {
    return data
  }

  try {
    // Detect dimensions from buffer
    const dimensions = imageSize(req.file.data)
    if (!dimensions.width || !dimensions.height) {
      return data
    }

    // Determine orientation
    const orientationName = getOrientationFromDimensions(
      dimensions.width,
      dimensions.height,
    )

    // Merge orientation tag with existing tags (if any)
    const existingTags = Array.isArray(data.tags) ? (data.tags as string[]) : []

    // Use Set to ensure no duplicates
    const mergedTags = Array.from(new Set([...existingTags, orientationName]))

    return { ...data, tags: mergedTags }
  } catch (error) {
    // Log error but don't fail the upload
    req.payload.logger.warn({
      msg: 'Failed to detect image orientation',
      filename: req.file.name,
      error: error instanceof Error ? error.message : String(error),
    })
    return data
  }
}
