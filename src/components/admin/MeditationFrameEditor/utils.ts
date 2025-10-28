import { Frame } from '@/payload-types'
import { LIMITS } from './constants'
import type { KeyframeData } from './types'

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export const validateTimestamp = (
  timestamp: number,
  existingTimestamps: number[],
  currentIndex?: number,
): string | null => {
  if (timestamp < 0) return 'Timestamp must be 0 or greater'
  if (!Number.isInteger(timestamp)) return 'Timestamp must be a whole number'
  if (timestamp > LIMITS.MAX_TIMESTAMP)
    return `Timestamp cannot exceed 1 hour (${LIMITS.MAX_TIMESTAMP}s)`

  // Check for duplicates (excluding current frame if provided)
  const otherTimestamps =
    currentIndex !== undefined
      ? existingTimestamps.filter((_, index) => index !== currentIndex)
      : existingTimestamps

  if (otherTimestamps.includes(timestamp)) {
    return `Timestamp ${timestamp}s is already used by another frame`
  }

  return null
}

export const pauseAllMedia = (): void => {
  // Pause all audio elements on the page
  const audioElements = document.querySelectorAll('audio')
  audioElements.forEach((audio) => {
    if (!audio.paused) {
      audio.pause()
    }
  })

  // Also pause any video elements that might be playing
  const videoElements = document.querySelectorAll('video')
  videoElements.forEach((video) => {
    if (!video.paused) {
      video.pause()
    }
  })
}

export const getCurrentFrame = (
  frames: KeyframeData[],
  currentTime: number,
): KeyframeData | null => {
  if (frames.length === 0) return null

  const sortedFrames = [...frames].sort((a, b) => a.timestamp - b.timestamp)
  let activeFrame = sortedFrames[0]

  for (const frame of sortedFrames) {
    if (frame.timestamp <= currentTime) {
      activeFrame = frame
    } else {
      break
    }
  }

  return activeFrame
}

export const clampValue = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max))
}

export const getProgressPercentage = (currentTime: number, duration: number): number => {
  if (!duration) return 0
  return (currentTime / duration) * 100
}

export const isVideoFile = (mimeType?: string | null): boolean => {
  return mimeType?.startsWith('video/') || false
}

export const getMediaUrl = (
  frame: Partial<Frame>,
  size: 'small' | 'large' = 'small',
): string | undefined => {
  return frame?.sizes?.[size]?.url || frame?.url || undefined
}

export const roundToNearestSecond = (time: number): number => {
  return Math.round(time)
}

export const getNextFrameTimestamp = (
  frames: KeyframeData[],
  currentTime: number,
): number | null => {
  const futureFrames = frames.filter((f) => f.timestamp > currentTime)
  if (futureFrames.length === 0) return null

  return Math.min(...futureFrames.map((f) => f.timestamp))
}

export const isInputElement = (element: Element): boolean => {
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA'
}

export const sortFramesByTimestamp = <T extends { timestamp: number }>(frames: T[]): T[] => {
  return [...frames].sort((a, b) => a.timestamp - b.timestamp)
}
