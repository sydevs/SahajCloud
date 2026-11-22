'use client'

import type { JSONFieldClientComponent } from 'payload'

import { FieldDescription, FieldError, toast, useField } from '@payloadcms/ui'
import React, { useCallback, useMemo, useState } from 'react'

import { fieldId } from '@/components/admin/helpers/fieldId'
import { usePlaybackTime, useSeekToTime } from '@/components/admin/helpers/livePreviewPlayback'
import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'
import type { KeyframeData } from '@/types/frames'

import styles from './FrameListManager.module.css'
import { FrameThumbnail } from './FrameThumbnail'
import shared from './shared.module.css'
import { formatTime, getFrameDisplayLabel, parseTime, validateTimestamp } from './utils'

// --- FrameItem Subcomponent ---

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
  onSeek,
}) => {
  const categoryLabel = getFrameDisplayLabel(frame)

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // The row's own controls answer their own clicks.
    if (!(e.target as HTMLElement).closest('input, button')) {
      onSeek(frame.timestamp)
    }
  }

  return (
    // The row's click is a mouse convenience over its whole width, and it holds
    // an input and a button, so it cannot be a control itself. The keyboard
    // path is the seek button below.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className={`${styles['frame-item']}${isActive ? ` ${styles['frame-item_active']}` : ''}`}
      onClick={handleClick}
    >
      <button
        aria-label={`Seek preview to ${formatTime(frame.timestamp)}`}
        className={styles['frame-item_seek']}
        onClick={() => onSeek(frame.timestamp)}
        type="button"
      >
        <FrameThumbnail className={styles.thumbnail} frame={frame} />
      </button>

      {/* Frame Info */}
      <div className={styles['frame-info']}>
        <div className={styles['frame-category']}>{categoryLabel}</div>
        {frame.tags && frame.tags.length > 0 && (
          <div className={styles['frame-tags']}>{frame.tags.join(', ')}</div>
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
        className={styles['timestamp-input']}
        title="Frame timestamp (MM:SS). Press Enter to save, Escape to cancel."
      />

      {/* Remove Button */}
      <button
        type="button"
        className={styles['frame-item_remove']}
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

// --- FrameListManager Component ---

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
  const currentPlaybackTime = usePlaybackTime() // Listen for playback time updates
  const seekToTime = useSeekToTime() // Send seek commands to live preview

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
      const categoryLabel = getFrameDisplayLabel(frame, index)

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

  return (
    <div className={fieldClasses} id={fieldId(name)} style={mergeFieldStyles(field.admin)}>
      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />

        <div className={styles.container}>
          {frames.length > 0 && (
            <div className={styles['playback-status']}>
              Current playback: {formatTime(currentPlaybackTime)} | {frames.length} frame
              {frames.length !== 1 ? 's' : ''}
            </div>
          )}

          {frames.length === 0 ? (
            <div className={shared['empty-state']}>
              <p className={shared['empty-state-title']}>No frames added yet</p>
              <p className={shared['empty-state-hint']}>
                Switch to the &quot;Insert&quot; tab to add frames from the library.
              </p>
            </div>
          ) : (
            <div className={styles['frame-list']}>
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
                  onSeek={seekToTime}
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
