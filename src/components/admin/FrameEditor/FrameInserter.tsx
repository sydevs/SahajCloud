'use client'

import type { UIFieldClientComponent } from 'payload'

import { Pill, toast, useField, useLivePreviewContext } from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { FRAME_CATEGORIES } from '@/lib/data'
import type { Frame, Narrator } from '@/payload-types'
import type { KeyframeData, KeyframeDefinition } from '@/types/frames'

import { baseStyles, inserterStyles } from './styles'
import { formatTime, getCategoryLabel } from './utils'

// ============================================================================
// Constants
// ============================================================================

const BATCH_SIZE = 1000

// ============================================================================
// Component
// ============================================================================

/**
 * FrameInserter - UI component for browsing and inserting frames into meditations
 *
 * Features:
 * - 2-column grid of available frames
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

  // Live preview context
  const { setIsLivePreviewing } = useLivePreviewContext()

  // Component state
  const [availableFrames, setAvailableFrames] = useState<Frame[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [narrator, setNarrator] = useState<Narrator | null>(null)
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0)
  const [clickedFrameId, setClickedFrameId] = useState<string | number | null>(null)
  const [hoveredFrameId, setHoveredFrameId] = useState<string | number | null>(null)

  const currentFrames = useMemo(() => frames || [], [frames])

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
      if (!narratorId || typeof window === 'undefined') {
        setNarrator(null)
        return
      }

      try {
        const response = await fetch(`/api/narrators/${narratorId}`)
        if (response.ok) {
          const data = (await response.json()) as Narrator
          setNarrator(data)
        }
      } catch {
        setNarrator(null)
      }
    }

    loadNarrator()
  }, [narratorId])

  // Load frames from API
  useEffect(() => {
    const loadFrames = async () => {
      try {
        setIsLoading(true)
        setError(null)

        let framesUrl = `/api/frames?limit=${BATCH_SIZE}`
        if (narrator?.gender) {
          framesUrl += `&where[imageSet][equals]=${narrator.gender}`
        }

        const response = await fetch(framesUrl)
        if (!response.ok) throw new Error('Failed to load frames')

        const data = (await response.json()) as { docs: Frame[] }
        setAvailableFrames(data.docs || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load frames')
      } finally {
        setIsLoading(false)
      }
    }

    loadFrames()
  }, [narrator?.gender])

  // Filter frames by selected category
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

  // Render frame card
  const renderFrameCard = (frame: Frame) => {
    const isHovered = hoveredFrameId === frame.id
    const isClicked = clickedFrameId === frame.id
    const isVideo = frame.mimeType?.startsWith('video/')
    const thumbnailUrl = frame.thumbnailUrl || frame.url

    return (
      <div
        key={frame.id}
        style={{
          ...inserterStyles.frameCard,
          ...(isHovered ? inserterStyles.frameCardHover : {}),
          ...(isClicked ? inserterStyles.frameCardSelected : {}),
        }}
        onClick={() => handleFrameInsert(frame)}
        onMouseEnter={() => setHoveredFrameId(frame.id)}
        onMouseLeave={() => setHoveredFrameId(null)}
        title={`Click to insert ${getCategoryLabel(frame.category || '')} at ${formatTime(insertionTimestamp)}`}
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

  // Loading state
  if (isLoading) {
    return <div style={baseStyles.loadingState}>Loading frames...</div>
  }

  // Error state
  if (error) {
    return <div style={baseStyles.errorState}>Error: {error}</div>
  }

  return (
    <div style={inserterStyles.container}>
      {/* Instructions Panel */}
      <div style={inserterStyles.instructionsPanel}>
        <span style={inserterStyles.instructionsHighlight}>Click any frame</span> to insert at{' '}
        <strong>{formatTime(insertionTimestamp)}</strong>
        {currentFrames.length === 0 && <span> (first frame will be placed at 0:00)</span>}
        {narrator?.gender && (
          <span style={{ marginLeft: '8px', opacity: 0.8 }}>
            Filtered for {narrator.gender} poses
          </span>
        )}
      </div>

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

      {/* Header Info */}
      <div style={inserterStyles.headerInfo}>
        <span>
          {filteredFrames.length} frame{filteredFrames.length !== 1 ? 's' : ''}
          {selectedCategory && ` in ${getCategoryLabel(selectedCategory)}`}
        </span>
        <span>{currentFrames.length} selected</span>
      </div>

      {/* Frames Grid */}
      {filteredFrames.length === 0 ? (
        <div style={baseStyles.emptyState}>
          {selectedCategory
            ? `No frames found in ${getCategoryLabel(selectedCategory)} category.`
            : 'No frames available.'}
        </div>
      ) : (
        <div style={inserterStyles.framesGrid}>{filteredFrames.map(renderFrameCard)}</div>
      )}
    </div>
  )
}

export default FrameInserter
