'use client'

import type { UIFieldClientComponent } from 'payload'

import { Pill, toast, useField, usePayloadAPI } from '@payloadcms/ui'
import React, { useCallback, useMemo, useState } from 'react'

import { FRAME_CATEGORIES } from '@/lib/data'
import type { Frame } from '@/payload-types'
import type { KeyframeData, KeyframeDefinition } from '@/types/frames'

import { useLivePreviewAuto, usePlaybackTime } from './hooks'
import { baseStyles, inserterStyles } from './styles'
import { formatTime, getCategoryLabel, getThumbnailUrl, isVideoFrame } from './utils'

// ============================================================================
// FrameCard Subcomponent
// ============================================================================

interface FrameCardProps {
  frame: Frame
  isHovered: boolean
  isClicked: boolean
  insertionTimestamp: number
  onInsert: (frame: Frame) => void
  onHover: (id: string | number | null) => void
}

const FrameCard: React.FC<FrameCardProps> = ({
  frame,
  isHovered,
  isClicked,
  insertionTimestamp,
  onInsert,
  onHover,
}) => {
  const isVideo = isVideoFrame(frame.mimeType)
  const thumbnailUrl = getThumbnailUrl(frame)

  return (
    <div
      style={{
        ...inserterStyles.frameCard,
        ...(isHovered ? inserterStyles.frameCardHover : {}),
        ...(isClicked ? inserterStyles.frameCardSelected : {}),
      }}
      onClick={() => onInsert(frame)}
      onMouseEnter={() => onHover(frame.id)}
      onMouseLeave={() => onHover(null)}
      title={`Insert ${getCategoryLabel(frame.category || '')} at ${formatTime(insertionTimestamp)}`}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={frame.category || 'Frame'}
          style={inserterStyles.frameThumbnail}
          loading="lazy"
        />
      ) : (
        <div style={inserterStyles.frameThumbnail} />
      )}

      {isVideo && <div style={inserterStyles.videoIndicator}>{frame.duration}s</div>}

      <div style={inserterStyles.frameInfo}>
        <div style={inserterStyles.frameCategory}>{getCategoryLabel(frame.category || '')}</div>
      </div>
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
  const [{ data: framesData, isLoading, isError }] = usePayloadAPI(
    narratorId ? `/api/frames/by-narrator/${narratorId}` : '',
  )

  // Memoize available frames to prevent unnecessary re-renders
  const availableFrames: Frame[] = useMemo(() => framesData?.docs || [], [framesData?.docs])

  // Component state for UI interactions
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [clickedFrameId, setClickedFrameId] = useState<string | number | null>(null)
  const [hoveredFrameId, setHoveredFrameId] = useState<string | number | null>(null)

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
      const existingIndex = currentFrames.findIndex((f) => f.timestamp === timestamp)

      let newFrames: KeyframeDefinition[]
      let message: string

      if (existingIndex !== -1) {
        // Replace existing frame
        newFrames = [...currentFrames]
        newFrames[existingIndex] = { id: frame.id, timestamp }
        message = `Frame replaced at ${formatTime(timestamp)}`
      } else {
        // Add new frame
        newFrames = [...currentFrames, { id: frame.id, timestamp }].sort(
          (a, b) => a.timestamp - b.timestamp,
        )
        message = `Frame added at ${formatTime(timestamp)}`
      }

      setFrames(newFrames as KeyframeData[])
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
    return <div style={baseStyles.errorState}>Error loading frames</div>
  }

  return (
    <div style={inserterStyles.container}>
      {/* Category Filters */}
      <div style={inserterStyles.categoryFilters}>
        {FRAME_CATEGORIES.map((category) => (
          <Pill
            key={category}
            pillStyle={selectedCategory === category ? 'success' : undefined}
            onClick={() => handleCategoryToggle(category)}
          >
            {getCategoryLabel(category)}
          </Pill>
        ))}
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
              isHovered={hoveredFrameId === frame.id}
              isClicked={clickedFrameId === frame.id}
              insertionTimestamp={insertionTimestamp}
              onInsert={handleFrameInsert}
              onHover={setHoveredFrameId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default FrameInserter
