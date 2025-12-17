'use client'

import type { UIFieldClientComponent } from 'payload'

import { Pill, toast, useField, useLivePreviewContext } from '@payloadcms/ui'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { FRAME_CATEGORY_OPTIONS, FRAME_CATEGORIES } from '@/lib/data'
import type { Frame, Narrator } from '@/payload-types'
import type { KeyframeData, KeyframeDefinition } from '@/types/frames'

// ============================================================================
// Constants
// ============================================================================

const BATCH_SIZE = 1000

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
    gap: 'calc(var(--base) * 0.75)',
  },
  instructionsPanel: {
    padding: 'calc(var(--base) * 0.75)',
    backgroundColor: 'var(--theme-elevation-50)',
    borderRadius: 'var(--style-radius-s)',
    border: '1px solid var(--theme-elevation-100)',
    fontSize: 'calc(var(--base-body-size) * 1px)',
    color: 'var(--theme-elevation-700)',
  },
  instructionsHighlight: {
    fontWeight: 600,
    color: 'var(--theme-success-500)',
  },
  categoryFilters: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 'calc(var(--base) * 0.25)',
    padding: 'calc(var(--base) * 0.5) 0',
  },
  framesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 'calc(var(--base) * 0.5)',
    maxHeight: '500px',
    overflowY: 'auto' as const,
    padding: '4px',
  },
  frameCard: {
    position: 'relative' as const,
    borderRadius: 'var(--style-radius-s)',
    overflow: 'hidden',
    border: '2px solid var(--theme-elevation-100)',
    backgroundColor: 'var(--theme-elevation-50)',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease, transform 0.15s ease',
  },
  frameCardHover: {
    borderColor: 'var(--theme-success-400)',
    transform: 'scale(1.02)',
  },
  frameCardSelected: {
    borderColor: 'var(--theme-success-500)',
    transform: 'scale(1.05)',
  },
  frameThumbnail: {
    width: '100%',
    aspectRatio: '1',
    objectFit: 'cover' as const,
    display: 'block',
    backgroundColor: 'var(--theme-elevation-200)',
  },
  frameInfo: {
    padding: 'calc(var(--base) * 0.35)',
    textAlign: 'center' as const,
    backgroundColor: 'var(--theme-elevation-100)',
  },
  frameCategory: {
    fontSize: 'calc(var(--base-body-size) * 0.85px)',
    fontWeight: 500,
    color: 'var(--theme-elevation-700)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  videoIndicator: {
    position: 'absolute' as const,
    top: '8px',
    right: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: '4px',
    padding: '2px 6px',
    fontSize: '10px',
    color: 'white',
    fontWeight: 500,
  },
  loadingState: {
    padding: 'calc(var(--base) * 2)',
    textAlign: 'center' as const,
    color: 'var(--theme-elevation-500)',
  },
  errorState: {
    padding: 'calc(var(--base) * 1)',
    textAlign: 'center' as const,
    color: 'var(--theme-error-500)',
    backgroundColor: 'var(--theme-error-100)',
    borderRadius: 'var(--style-radius-s)',
  },
  emptyState: {
    padding: 'calc(var(--base) * 2)',
    textAlign: 'center' as const,
    color: 'var(--theme-elevation-500)',
    backgroundColor: 'var(--theme-elevation-50)',
    borderRadius: 'var(--style-radius-m)',
    border: '1px dashed var(--theme-elevation-200)',
  },
  headerInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 'calc(var(--base-body-size) * 0.9px)',
    color: 'var(--theme-elevation-500)',
  },
}

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
          ...styles.frameCard,
          ...(isHovered ? styles.frameCardHover : {}),
          ...(isClicked ? styles.frameCardSelected : {}),
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
            style={styles.frameThumbnail}
            loading="lazy"
          />
        ) : (
          <div style={styles.frameThumbnail} />
        )}

        {isVideo && <div style={styles.videoIndicator}>{frame.duration}s</div>}

        <div style={styles.frameInfo}>
          <div style={styles.frameCategory}>{getCategoryLabel(frame.category || '')}</div>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return <div style={styles.loadingState}>Loading frames...</div>
  }

  // Error state
  if (error) {
    return <div style={styles.errorState}>Error: {error}</div>
  }

  return (
    <div style={styles.container}>
      {/* Instructions Panel */}
      <div style={styles.instructionsPanel}>
        <span style={styles.instructionsHighlight}>Click any frame</span> to insert at{' '}
        <strong>{formatTime(insertionTimestamp)}</strong>
        {currentFrames.length === 0 && (
          <span> (first frame will be placed at 0:00)</span>
        )}
        {narrator?.gender && (
          <span style={{ marginLeft: '8px', opacity: 0.8 }}>
            Filtered for {narrator.gender} poses
          </span>
        )}
      </div>

      {/* Category Filters */}
      <div style={styles.categoryFilters}>
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
      <div style={styles.headerInfo}>
        <span>
          {filteredFrames.length} frame{filteredFrames.length !== 1 ? 's' : ''}
          {selectedCategory && ` in ${getCategoryLabel(selectedCategory)}`}
        </span>
        <span>
          {currentFrames.length} selected
        </span>
      </div>

      {/* Frames Grid */}
      {filteredFrames.length === 0 ? (
        <div style={styles.emptyState}>
          {selectedCategory
            ? `No frames found in ${getCategoryLabel(selectedCategory)} category.`
            : 'No frames available.'}
        </div>
      ) : (
        <div style={styles.framesGrid}>{filteredFrames.map(renderFrameCard)}</div>
      )}
    </div>
  )
}

export default FrameInserter
