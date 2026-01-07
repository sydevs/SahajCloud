'use client'

import type { JSONFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, toast, useField } from '@payloadcms/ui'
import React, { useCallback, useMemo, useState } from 'react'

import type { KeyframeData } from '@/types/frames'

import styles from './FrameListManager.module.css'
import { FrameThumbnail } from './FrameThumbnail'
import { useLivePreviewAuto, usePlaybackTime, useSeekToTime } from './hooks'
import { baseStyles, listManagerStyles } from './styles'
import { formatTime, getCategoryLabel, parseTime, validateTimestamp } from './utils'

// ============================================================================
// FrameItem Subcomponent
// ============================================================================

interface FrameItemProps {
  frame: KeyframeData
  index: number
  isActive: boolean
  isEditing: boolean
  editingValue: string
  readOnly?: boolean
  onEditingChange: (value: string) => void
  onTimestampFocus: (index: number) => void
  onTimestampCommit: (index: number) => void
  onTimestampKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, index: number) => void
  onRemove: (index: number) => void
  onSeek: (timestamp: number) => void
}

const FrameItem: React.FC<FrameItemProps> = ({
  frame,
  index,
  isActive,
  isEditing,
  editingValue,
  readOnly,
  onEditingChange,
  onTimestampFocus,
  onTimestampCommit,
  onTimestampKeyDown,
  onRemove,
}) => {
  const categoryLabel = frame.category ? getCategoryLabel(frame.category) : `Frame ${frame.id}`

  return (
    <div className={`${styles['frame-item']}${isActive ? ` ${styles['frame-item_active']}` : ''}`}>
      {/* Thumbnail */}
      <FrameThumbnail frame={frame} style={baseStyles.thumbnail} />

      {/* Frame Info */}
      <div style={listManagerStyles.frameInfo}>
        <div style={baseStyles.frameCategory}>{categoryLabel}</div>
        {frame.tags && frame.tags.length > 0 && (
          <div style={listManagerStyles.frameTags}>{frame.tags.join(', ')}</div>
        )}
      </div>

      {/* Timestamp Input */}
      <input
        type="text"
        value={isEditing ? editingValue : formatTime(frame.timestamp)}
        onChange={(e) => onEditingChange(e.target.value)}
        onFocus={() => onTimestampFocus(index)}
        onBlur={() => onTimestampCommit(index)}
        onKeyDown={(e) => onTimestampKeyDown(e, index)}
        disabled={readOnly}
        style={listManagerStyles.timestampInput}
        title="Frame timestamp (MM:SS). Press Enter to save, Escape to cancel."
      />

      {/* Remove Button */}
      <button
        type="button"
        className={styles['frame-item__remove']}
        onClick={() => onRemove(index)}
        disabled={readOnly}
        title="Remove frame"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </svg>
      </button>
    </div>
  )
}

// ============================================================================
// FrameListManager Component
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
  const { name, admin: { description } = {} } = field

  // Field state
  const { value, setValue, showError } = useField<KeyframeData[]>()
  const frames = useMemo(() => value || [], [value])

  // Custom hooks for shared functionality
  useLivePreviewAuto() // Auto-open live preview panel
  const currentPlaybackTime = usePlaybackTime() // Listen for playback time updates

  // Local editing state for timestamp inputs
  // Allows user to type freely without immediate validation/revert
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState<string>('')

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

  // Build CSS classes
  const fieldClasses = ['field-type', 'json', showError && 'error', readOnly && 'read-only']
    .filter(Boolean)
    .join(' ')

  const fieldId = `field-${name.replace(/\./g, '__')}`

  return (
    <div className={fieldClasses} id={fieldId}>
      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        <div style={baseStyles.container}>
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

          {frames.length === 0 ? (
            <div style={baseStyles.emptyState}>
              <p style={{ margin: 0, marginBottom: '8px', fontWeight: 500 }}>No frames added yet</p>
              <p style={{ margin: 0, fontSize: 'calc(var(--base-body-size) * 0.9px)' }}>
                Switch to the &quot;Insert&quot; tab to add frames from the library.
              </p>
            </div>
          ) : (
            <div style={listManagerStyles.frameList}>
              {frames.map((frame, index) => (
                <FrameItem
                  key={`${frame.id}-${frame.timestamp}`}
                  frame={frame}
                  index={index}
                  isActive={index === activeFrameIndex}
                  isEditing={editingIndex === index}
                  editingValue={editingValue}
                  readOnly={readOnly}
                  onEditingChange={setEditingValue}
                  onTimestampFocus={handleTimestampFocus}
                  onTimestampCommit={handleTimestampCommit}
                  onTimestampKeyDown={handleTimestampKeyDown}
                  onRemove={handleRemoveFrame}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default FrameListManager
