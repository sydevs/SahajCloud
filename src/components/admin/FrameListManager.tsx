'use client'

import type { JSONFieldClientComponent } from 'payload'

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  toast,
  useField,
  useForm,
  useLivePreviewContext,
} from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { FRAME_CATEGORY_OPTIONS } from '@/lib/data'
import type { Narrator } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

// ============================================================================
// Time Format Utilities
// ============================================================================

/**
 * Format seconds to MM:SS display format
 */
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Parse MM:SS or M:SS format to seconds
 * Returns null if format is invalid
 */
const parseTime = (timeStr: string): number | null => {
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
const validateTimestamp = (
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
const getCategoryLabel = (value: string): string => {
  const option = FRAME_CATEGORY_OPTIONS.find((opt) => opt.value === value)
  return option?.label || value
}

// ============================================================================
// Styles (using PayloadCMS CSS variables)
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.5)',
  },
  frameList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'calc(var(--base) * 0.25)',
  },
  frameItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(var(--base) * 0.5)',
    padding: 'calc(var(--base) * 0.5)',
    backgroundColor: 'var(--theme-elevation-50)',
    borderRadius: 'var(--style-radius-s)',
    border: '1px solid var(--theme-elevation-100)',
    transition: 'border-color 0.15s ease',
  },
  frameItemActive: {
    borderLeftWidth: '4px',
    borderLeftColor: 'var(--theme-success-500)',
    backgroundColor: 'var(--theme-elevation-100)',
  },
  thumbnail: {
    width: '60px',
    height: '60px',
    objectFit: 'cover' as const,
    borderRadius: 'var(--style-radius-s)',
    backgroundColor: 'var(--theme-elevation-200)',
    flexShrink: 0,
  },
  frameInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  frameCategory: {
    fontSize: 'calc(var(--base-body-size) * 1px)',
    fontWeight: 500,
    color: 'var(--theme-elevation-800)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  frameTags: {
    fontSize: 'calc(var(--base-body-size) * 0.85px)',
    color: 'var(--theme-elevation-500)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  timestampInput: {
    width: '70px',
    padding: 'calc(var(--base) * 0.25) calc(var(--base) * 0.5)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    textAlign: 'center' as const,
    border: '1px solid var(--theme-elevation-200)',
    borderRadius: 'var(--style-radius-s)',
    backgroundColor: 'var(--theme-input-bg)',
    color: 'var(--theme-elevation-800)',
  },
  timestampInputError: {
    borderColor: 'var(--theme-error-500)',
  },
  removeButton: {
    padding: 'calc(var(--base) * 0.25)',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 'var(--style-radius-s)',
    cursor: 'pointer',
    color: 'var(--theme-elevation-400)',
    transition: 'color 0.15s ease, background-color 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    padding: 'calc(var(--base) * 2)',
    textAlign: 'center' as const,
    color: 'var(--theme-elevation-500)',
    backgroundColor: 'var(--theme-elevation-50)',
    borderRadius: 'var(--style-radius-m)',
    border: '1px dashed var(--theme-elevation-200)',
  },
  loadingState: {
    padding: 'calc(var(--base) * 1)',
    textAlign: 'center' as const,
    color: 'var(--theme-elevation-500)',
  },
  videoIndicator: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: '50%',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailContainer: {
    position: 'relative' as const,
    width: '60px',
    height: '60px',
    flexShrink: 0,
  },
}

// ============================================================================
// Component
// ============================================================================

/**
 * FrameListManager - Custom field component for managing meditation frames
 *
 * Features:
 * - Auto-opens live preview panel for playback sync
 * - Displays frames with thumbnails, categories, and editable timestamps
 * - Highlights current frame based on live preview playback time
 * - MM:SS timestamp format for editing
 * - Remove button with confirmation
 * - Auto-sorts frames by timestamp after changes
 */
export const FrameListManager: JSONFieldClientComponent = ({ field, readOnly }) => {
  const {
    name,
    label,
    required,
    admin: { description } = {},
  } = field

  // Field state
  const { value, setValue, showError } = useField<KeyframeData[]>()
  const frames = useMemo(() => value || [], [value])

  // Live preview context for auto-opening
  const { setIsLivePreviewing } = useLivePreviewContext()

  // Current playback time from live preview
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0)

  // Loading state for narrator fetch
  const [narrator, setNarrator] = useState<Narrator | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Get form data for narrator field
  const { getData } = useForm()

  // Auto-open live preview when component mounts
  useEffect(() => {
    setIsLivePreviewing(true)
  }, [setIsLivePreviewing])

  // Listen for playback time updates from live preview iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PLAYBACK_TIME_UPDATE') {
        setCurrentPlaybackTime(event.data.currentTime)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Load narrator data
  useEffect(() => {
    const loadNarrator = async () => {
      try {
        setIsLoading(true)
        const formData = getData()
        const narratorId = formData?.narrator

        if (narratorId && typeof window !== 'undefined') {
          const response = await fetch(`/api/narrators/${narratorId}`)
          if (response.ok) {
            const data = (await response.json()) as Narrator
            setNarrator(data)
          }
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadNarrator()
  }, [getData])

  // Get the currently active frame based on playback time
  const activeFrameIndex = useMemo(() => {
    if (frames.length === 0) return -1

    let activeIndex = 0
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].timestamp <= currentPlaybackTime) {
        activeIndex = i
      } else {
        break
      }
    }
    return activeIndex
  }, [frames, currentPlaybackTime])

  // Handle timestamp change
  const handleTimestampChange = useCallback(
    (index: number, newTimeStr: string) => {
      const newTimestamp = parseTime(newTimeStr)
      if (newTimestamp === null) {
        toast.error('Invalid time format. Use MM:SS (e.g., 1:30)')
        return
      }

      const existingTimestamps = frames.map((f) => f.timestamp)
      const error = validateTimestamp(newTimestamp, existingTimestamps, index)
      if (error) {
        toast.error(error)
        return
      }

      const updatedFrames = [...frames]
      updatedFrames[index] = { ...updatedFrames[index], timestamp: newTimestamp }

      // Sort by timestamp
      updatedFrames.sort((a, b) => a.timestamp - b.timestamp)
      setValue(updatedFrames)
    },
    [frames, setValue],
  )

  // Handle frame removal
  const handleRemoveFrame = useCallback(
    (index: number) => {
      const frame = frames[index]
      const categoryLabel = frame.category ? getCategoryLabel(frame.category) : `Frame ${index + 1}`

      if (window.confirm(`Remove "${categoryLabel}" at ${formatTime(frame.timestamp)}?`)) {
        const updatedFrames = frames.filter((_, i) => i !== index)
        setValue(updatedFrames)
        toast.success('Frame removed')
      }
    },
    [frames, setValue],
  )

  // Render thumbnail
  const renderThumbnail = (frame: KeyframeData) => {
    const isVideo = frame.mimeType?.startsWith('video/')
    const thumbnailUrl = frame.thumbnailUrl || frame.url

    return (
      <div style={styles.thumbnailContainer}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={frame.category || 'Frame'} style={styles.thumbnail} />
        ) : (
          <div style={styles.thumbnail} />
        )}
        {isVideo && (
          <div style={styles.videoIndicator}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </div>
        )}
      </div>
    )
  }

  // Build CSS classes
  const fieldClasses = ['field-type', 'json', showError && 'error', readOnly && 'read-only']
    .filter(Boolean)
    .join(' ')

  const fieldId = `field-${name.replace(/\./g, '__')}`

  if (isLoading) {
    return (
      <div className={fieldClasses} id={fieldId}>
        <FieldLabel label={label} path={name} required={required} />
        <div style={styles.loadingState}>Loading...</div>
      </div>
    )
  }

  return (
    <div className={fieldClasses} id={fieldId}>
      <FieldLabel label={label} path={name} required={required} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        <div style={styles.container}>
          {frames.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={{ margin: 0, marginBottom: '8px', fontWeight: 500 }}>No frames added yet</p>
              <p style={{ margin: 0, fontSize: 'calc(var(--base-body-size) * 0.9px)' }}>
                Switch to the &quot;Insert&quot; tab to add frames from the library.
                {narrator?.gender && ` Frames are filtered for ${narrator.gender} poses.`}
              </p>
            </div>
          ) : (
            <div style={styles.frameList}>
              {frames.map((frame, index) => {
                const isActive = index === activeFrameIndex
                const categoryLabel = frame.category
                  ? getCategoryLabel(frame.category)
                  : `Frame ${frame.id}`

                return (
                  <div
                    key={`${frame.id}-${frame.timestamp}`}
                    style={{
                      ...styles.frameItem,
                      ...(isActive ? styles.frameItemActive : {}),
                    }}
                  >
                    {renderThumbnail(frame)}

                    <div style={styles.frameInfo}>
                      <div style={styles.frameCategory}>{categoryLabel}</div>
                      {frame.tags && frame.tags.length > 0 && (
                        <div style={styles.frameTags}>{frame.tags.join(', ')}</div>
                      )}
                    </div>

                    <input
                      type="text"
                      value={formatTime(frame.timestamp)}
                      onChange={(e) => handleTimestampChange(index, e.target.value)}
                      onBlur={(e) => {
                        // Re-validate on blur and reset if invalid
                        const parsed = parseTime(e.target.value)
                        if (parsed === null) {
                          e.target.value = formatTime(frame.timestamp)
                        }
                      }}
                      disabled={readOnly}
                      style={styles.timestampInput}
                      title="Frame timestamp (MM:SS)"
                    />

                    <button
                      type="button"
                      onClick={() => handleRemoveFrame(index)}
                      disabled={readOnly}
                      style={styles.removeButton}
                      title="Remove frame"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--theme-error-500)'
                        e.currentTarget.style.backgroundColor = 'var(--theme-error-100)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--theme-elevation-400)'
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {frames.length > 0 && (
            <div
              style={{
                fontSize: 'calc(var(--base-body-size) * 0.85px)',
                color: 'var(--theme-elevation-500)',
                marginTop: 'calc(var(--base) * 0.25)',
              }}
            >
              Current playback: {formatTime(currentPlaybackTime)} | {frames.length} frame
              {frames.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default FrameListManager
