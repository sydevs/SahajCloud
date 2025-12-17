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

import type { Narrator } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

import { baseStyles, listManagerStyles } from './styles'
import { formatTime, getCategoryLabel, parseTime, validateTimestamp } from './utils'

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

  // Local editing state for timestamp inputs
  // Allows user to type freely without immediate validation/revert
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')

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

  // Start editing a timestamp
  const handleTimestampFocus = useCallback(
    (index: number) => {
      setEditingIndex(index)
      setEditingValue(formatTime(frames[index].timestamp))
    },
    [frames],
  )

  // Commit timestamp change on blur or Enter
  const handleTimestampCommit = useCallback(
    (index: number) => {
      const newTimestamp = parseTime(editingValue)

      // Reset editing state
      setEditingIndex(null)
      setEditingValue('')

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
    [frames, setValue, editingValue],
  )

  // Handle Enter key to commit
  const handleTimestampKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleTimestampCommit(index)
        ;(e.target as HTMLInputElement).blur()
      } else if (e.key === 'Escape') {
        setEditingIndex(null)
        setEditingValue('')
        ;(e.target as HTMLInputElement).blur()
      }
    },
    [handleTimestampCommit],
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
      <div style={baseStyles.thumbnailContainer}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={frame.category || 'Frame'} style={baseStyles.thumbnail} />
        ) : (
          <div style={baseStyles.thumbnail} />
        )}
        {isVideo && (
          <div style={listManagerStyles.videoIndicator}>
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
        <div style={baseStyles.loadingState}>Loading...</div>
      </div>
    )
  }

  return (
    <div className={fieldClasses} id={fieldId}>
      <FieldLabel label={label} path={name} required={required} />

      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        <div style={baseStyles.container}>
          {frames.length === 0 ? (
            <div style={baseStyles.emptyState}>
              <p style={{ margin: 0, marginBottom: '8px', fontWeight: 500 }}>No frames added yet</p>
              <p style={{ margin: 0, fontSize: 'calc(var(--base-body-size) * 0.9px)' }}>
                Switch to the &quot;Insert&quot; tab to add frames from the library.
                {narrator?.gender && ` Frames are filtered for ${narrator.gender} poses.`}
              </p>
            </div>
          ) : (
            <div style={listManagerStyles.frameList}>
              {frames.map((frame, index) => {
                const isActive = index === activeFrameIndex
                const categoryLabel = frame.category
                  ? getCategoryLabel(frame.category)
                  : `Frame ${frame.id}`

                return (
                  <div
                    key={`${frame.id}-${frame.timestamp}`}
                    style={{
                      ...listManagerStyles.frameItem,
                      ...(isActive ? listManagerStyles.frameItemActive : {}),
                    }}
                  >
                    {renderThumbnail(frame)}

                    <div style={listManagerStyles.frameInfo}>
                      <div style={baseStyles.frameCategory}>{categoryLabel}</div>
                      {frame.tags && frame.tags.length > 0 && (
                        <div style={listManagerStyles.frameTags}>{frame.tags.join(', ')}</div>
                      )}
                    </div>

                    <input
                      type="text"
                      value={editingIndex === index ? editingValue : formatTime(frame.timestamp)}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onFocus={() => handleTimestampFocus(index)}
                      onBlur={() => handleTimestampCommit(index)}
                      onKeyDown={(e) => handleTimestampKeyDown(e, index)}
                      disabled={readOnly}
                      style={listManagerStyles.timestampInput}
                      title="Frame timestamp (MM:SS). Press Enter to save, Escape to cancel."
                    />

                    <button
                      type="button"
                      onClick={() => handleRemoveFrame(index)}
                      disabled={readOnly}
                      style={listManagerStyles.removeButton}
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
