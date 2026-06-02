import { SUBTLE_SYSTEM_NODE_OPTIONS } from '@/collections/SubtleSystemNodes/SubtleSystemNodes'
import type { Frame, SubtleSystemNode } from '@/payload-types'

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
 * Resolve a frame's subtle-system node slug.
 * Handles both populated objects and bare ids/null.
 */
export const getFrameSubtleSystemNodeSlug = (
  frame: Pick<Frame, 'subtleSystemNode'> | null | undefined,
): string | null => {
  const value = frame?.subtleSystemNode
  if (!value) return null
  if (typeof value === 'object') return (value as SubtleSystemNode).slug ?? null
  return null
}

/**
 * Get the display label for a subtle-system node slug.
 * Falls back to the raw value when no label is registered.
 */
export const getSubtleSystemNodeLabel = (slug: string | null | undefined): string => {
  if (!slug) return ''
  const option = SUBTLE_SYSTEM_NODE_OPTIONS.find((opt) => opt.value === slug)
  return option?.label || slug
}

export const getFrameDisplayLabel = (
  frame: (Pick<Frame, 'label' | 'subtleSystemNode'> & { id: number | string }) | null | undefined,
  fallbackIndex?: number,
): string => {
  if (!frame) return ''
  if (frame.label) return frame.label
  const slug = getFrameSubtleSystemNodeSlug(frame)
  if (slug) return getSubtleSystemNodeLabel(slug)
  return fallbackIndex !== undefined ? `Frame ${fallbackIndex + 1}` : `Frame ${frame.id}`
}

/**
 * Check if a frame is a video based on its mimeType
 */
export const isVideoFrame = (mimeType?: string | null): boolean => {
  return mimeType?.startsWith('video/') ?? false
}
