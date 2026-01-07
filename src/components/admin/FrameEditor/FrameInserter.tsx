'use client'

import type { UIFieldClientComponent } from 'payload'

import { Pill, toast, useField } from '@payloadcms/ui'
import React, { useCallback, useMemo, useState } from 'react'

import { FRAME_CATEGORIES } from '@/lib/data'
import type { Frame } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

import styles from './FrameInserter.module.css'
import { FrameThumbnail } from './FrameThumbnail'
import { useAvailableFrames, useLivePreviewAuto, usePlaybackTime } from './hooks'
import { baseStyles, inserterStyles } from './styles'
import { formatTime, getCategoryLabel } from './utils'

// ============================================================================
// FrameCard Subcomponent
// ============================================================================

interface FrameCardProps {
  frame: Frame
  isClicked: boolean
  insertionTimestamp: number
  onInsert: (frame: Frame) => void
}

const FrameCard: React.FC<FrameCardProps> = ({
  frame,
  isClicked,
  insertionTimestamp,
  onInsert,
}) => {
  return (
    <div
      className={`${styles['frame-card']}${isClicked ? ` ${styles['frame-card_clicked']}` : ''}`}
      onClick={() => onInsert(frame)}
      title={`Insert ${getCategoryLabel(frame.category || '')} at ${formatTime(insertionTimestamp)}`}
    >
      {/* Thumbnail with category pill overlay */}
      <div style={inserterStyles.thumbnailContainer}>
        <FrameThumbnail frame={frame} style={inserterStyles.frameThumbnail} />
        <div style={inserterStyles.categoryPill}>{getCategoryLabel(frame.category || '')}</div>
      </div>

      {/* Tags below thumbnail */}
      {frame.tags && frame.tags.length > 0 && (
        <div style={inserterStyles.frameInfo}>
          <div style={inserterStyles.frameTags}>{frame.tags.join(', ')}</div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// FrameInserter Component
// ============================================================================

/**
 * FrameInserter - UI component for browsing and inserting frames into meditations
 *
 * Features:
 * - 3-column grid of available frames
 * - Category filtering with Pills (click to toggle)
 * - Gender-based filtering from narrator
 * - Insert frame at current playback time
 * - First-frame rule: insert at 0s if no frames exist
 * - Replace behavior: replaces existing frame at same timestamp
 */
export const FrameInserter: UIFieldClientComponent = () => {
  // Access sibling fields
  const { value: frames, setValue: setFrames } = useField<KeyframeData[]>({ path: 'frames' })
  const { value: narratorId } = useField<string>({ path: 'narrator' })

  // Custom hooks for shared functionality
  useLivePreviewAuto() // Auto-open live preview panel
  const currentPlaybackTime = usePlaybackTime() // Listen for playback time updates

  // Fetch frames filtered by narrator's gender using custom endpoint
  // Server handles the narrator lookup and gender filtering in a single request
  // Uses module-level cache with TTL to avoid re-fetching when switching tabs
  const { frames: availableFrames, isLoading, isError, error } = useAvailableFrames(narratorId)

  // Component state for UI interactions
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [clickedFrameId, setClickedFrameId] = useState<string | number | null>(null)

  const currentFrames = useMemo(() => frames || [], [frames])

  // Filter frames by selected category (client-side, after server-side gender filter)
  const filteredFrames = useMemo(() => {
    if (!selectedCategory) return availableFrames
    return availableFrames.filter((frame) => frame.category === selectedCategory)
  }, [availableFrames, selectedCategory])

  // Handle category filter toggle
  const handleCategoryToggle = useCallback((category: string) => {
    setSelectedCategory((prev) => (prev === category ? null : category))
  }, [])

  // Handle frame selection (insert)
  const handleFrameInsert = useCallback(
    (frame: Frame) => {
      // First frame rule: always insert at 0
      const timestamp = currentFrames.length === 0 ? 0 : Math.round(currentPlaybackTime)

      // Check for existing frame at this timestamp
      const existingIndex = currentFrames.findIndex((f: KeyframeData) => f.timestamp === timestamp)

      // Create enriched frame data for immediate display in FrameListManager
      // Server's beforeChange hook will strip this down to { id, timestamp } on save
      const frameData: KeyframeData = {
        ...frame,
        timestamp,
      }

      let newFrames: KeyframeData[]
      let message: string

      if (existingIndex !== -1) {
        // Replace existing frame
        newFrames = [...currentFrames]
        newFrames[existingIndex] = frameData
        message = `Frame replaced at ${formatTime(timestamp)}`
      } else {
        // Add new frame
        newFrames = [...currentFrames, frameData].sort((a, b) => a.timestamp - b.timestamp)
        message = `Frame added at ${formatTime(timestamp)}`
      }

      setFrames(newFrames)
      toast.success(message)

      // Visual click feedback
      setClickedFrameId(frame.id)
      setTimeout(() => setClickedFrameId(null), 300)
    },
    [currentFrames, currentPlaybackTime, setFrames],
  )

  // Calculate insertion timestamp for display
  const insertionTimestamp = currentFrames.length === 0 ? 0 : Math.round(currentPlaybackTime)

  // Loading state
  if (isLoading) {
    return <div style={baseStyles.loadingState}>Loading frames...</div>
  }

  // Error state
  if (isError) {
    return <div style={baseStyles.errorState}>{error || 'Error loading frames'}</div>
  }

  return (
    <div style={inserterStyles.container}>
      {/* Category Filters */}
      <div
        className="doc-controls"
        style={{
          top: 66,
          marginLeft: 'calc(var(--gutter-h) * -1)',
          width: 'calc(100% + var(--gutter-h) * 2)',
          padding: '0 var(--gutter-h)',
        }}
      >
        <div style={inserterStyles.categoryFilters}>
          {FRAME_CATEGORIES.map((category) => (
            <Pill
              key={category}
              size="small"
              pillStyle={selectedCategory === category ? 'success' : 'warning'}
              onClick={() => handleCategoryToggle(category)}
              elementProps={{ ref: () => {}, style: inserterStyles.filterPillElement }}
            >
              {getCategoryLabel(category)}
            </Pill>
          ))}
        </div>
      </div>

      {/* Frames Grid */}
      {filteredFrames.length === 0 ? (
        <div style={baseStyles.emptyState}>
          {selectedCategory
            ? `No frames in ${getCategoryLabel(selectedCategory)}.`
            : 'No frames available.'}
        </div>
      ) : (
        <div style={inserterStyles.framesGrid}>
          {filteredFrames.map((frame) => (
            <FrameCard
              key={frame.id}
              frame={frame}
              isClicked={clickedFrameId === frame.id}
              insertionTimestamp={insertionTimestamp}
              onInsert={handleFrameInsert}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default FrameInserter
