import { FRAME_CATEGORY_OPTIONS } from '@/lib/data'

/**
 * Format seconds to MM:SS display format
 */
export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Parse MM:SS or M:SS format to seconds
 * Returns null if format is invalid
 */
export const parseTime = (timeStr: string): number | null => {
  const trimmed = timeStr.trim()

  // Match MM:SS or M:SS format
  const match = trimmed.match(/^(\d+):(\d{1,2})$/)
  if (!match) return null

  const mins = parseInt(match[1], 10)
  const secs = parseInt(match[2], 10)

  // Validate seconds < 60
  if (secs >= 60) return null

  return mins * 60 + secs
}

/**
 * Validate a timestamp value
 */
export const validateTimestamp = (
  timestamp: number,
  existingTimestamps: number[],
  currentIndex?: number,
): string | null => {
  if (timestamp < 0) return 'Timestamp must be 0 or greater'
  if (!Number.isInteger(timestamp)) return 'Timestamp must be a whole number'
  if (timestamp > 3600) return 'Timestamp cannot exceed 1 hour (60:00)'

  // Check for duplicates (excluding current frame if provided)
  const otherTimestamps =
    currentIndex !== undefined
      ? existingTimestamps.filter((_, index) => index !== currentIndex)
      : existingTimestamps

  if (otherTimestamps.includes(timestamp)) {
    return `Timestamp ${formatTime(timestamp)} is already used by another frame`
  }

  return null
}

/**
 * Get the category label for a category value
 */
export const getCategoryLabel = (value: string): string => {
  const option = FRAME_CATEGORY_OPTIONS.find((opt) => opt.value === value)
  return option?.label || value
}

/**
 * Check if a frame is a video based on its mimeType
 */
export const isVideoFrame = (mimeType?: string | null): boolean => {
  return mimeType?.startsWith('video/') ?? false
}

/**
 * Get the preview URL for a frame, falling back to the main URL
 */
export const getPreviewUrl = (frame: {
  previewUrl?: string | null
  url?: string | null
}): string | undefined => {
  return frame.previewUrl || frame.url || undefined
}
