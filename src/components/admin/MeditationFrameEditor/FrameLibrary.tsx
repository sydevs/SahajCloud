'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import type { Frame, Narrator } from '@/payload-types'
import type { KeyframeData } from './types'
import { FRAME_CATEGORIES } from '@/lib/data'
import FrameItem from './FrameItem'
import { isVideoFile, formatTime } from './utils'
import { LIMITS, GRID_CONFIG, SIZES } from './constants'
import {
  ComponentContainer,
  ComponentHeader,
  ComponentHeaderCount,
  CategoryFilters,
  CategoryButton,
  ClearFiltersButton,
  FramesGrid,
  LoadingState,
  ErrorState,
  EmptyState,
  InstructionsPanel,
} from './styled'

interface FrameLibraryProps {
  narrator: Narrator | null
  onFrameSelect: (frame: Frame) => void
  disabled?: boolean
  currentTime: number
  frames: KeyframeData[]
}

const FrameLibrary: React.FC<FrameLibraryProps> = ({
  narrator,
  onFrameSelect,
  disabled = false,
  currentTime,
  frames: currentFrames,
}) => {
  const [frames, setFrames] = useState<Frame[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clickedFrameId, setClickedFrameId] = useState<string | null>(null)

  // Load frames
  useEffect(() => {
    const loadFrames = async () => {
      try {
        setIsLoading(true)
        setError(null)

        let framesUrl = `/api/frames?limit=${LIMITS.BATCH_SIZE}`
        if (narrator?.gender) {
          framesUrl += `&where[imageSet][equals]=${narrator.gender}`
        }

        const response = await fetch(framesUrl)
        if (!response.ok) throw new Error('Failed to load frames')

        const data = await response.json()
        setFrames(data.docs || [])
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
    if (!selectedCategory) return frames
    return frames.filter((frame) => frame.category === selectedCategory)
  }, [frames, selectedCategory])

  const handleCategorySelect = useCallback((category: string) => {
    setSelectedCategory((prev) => (prev === category ? null : category))
  }, [])

  const clearCategoryFilter = useCallback(() => {
    setSelectedCategory(null)
  }, [])

  const handleFrameClick = useCallback(
    (frame: Frame) => {
      if (disabled) return

      setClickedFrameId(frame.id)
      setTimeout(() => setClickedFrameId(null), LIMITS.CLICK_ANIMATION_DURATION)
      onFrameSelect(frame)
    },
    [disabled, onFrameSelect],
  )

  if (isLoading) {
    return (
      <ComponentContainer>
        <ComponentHeader>Frame Library</ComponentHeader>
        <LoadingState>Loading frames...</LoadingState>
      </ComponentContainer>
    )
  }

  if (error) {
    return (
      <ComponentContainer>
        <ComponentHeader>Frame Library</ComponentHeader>
        <ErrorState>Error: {error}</ErrorState>
      </ComponentContainer>
    )
  }

  return (
    <ComponentContainer>
      <ComponentHeader>
        Frame Library ({filteredFrames.length} frames)
        {narrator?.gender && (
          <ComponentHeaderCount>Filtered for {narrator.gender} poses</ComponentHeaderCount>
        )}
      </ComponentHeader>

      {/* Instructions */}
      {narrator && (
        <InstructionsPanel>
          <strong>📍 Instructions:</strong> Click any frame to add at{' '}
          {formatTime(Math.round(currentTime))}.{' '}
          {currentFrames.length === 0 && (
            <span style={{ color: 'var(--theme-success-400)' }}>First frame → 0s.</span>
          )}{' '}
          <strong>Keys:</strong> SPACE=play/pause, ←→=±5s
        </InstructionsPanel>
      )}

      {/* Category Filters */}
      <CategoryFilters>
        {FRAME_CATEGORIES.map((category) => (
          <CategoryButton
            key={category}
            type="button"
            onClick={() => handleCategorySelect(category)}
            disabled={disabled}
            $selected={selectedCategory === category}
            $disabled={disabled}
          >
            {category}
          </CategoryButton>
        ))}
        {selectedCategory && (
          <ClearFiltersButton
            type="button"
            onClick={clearCategoryFilter}
            disabled={disabled}
            $disabled={disabled}
          >
            Clear filter
          </ClearFiltersButton>
        )}
      </CategoryFilters>

      {/* Frames Grid */}
      {filteredFrames.length === 0 ? (
        <EmptyState>
          {selectedCategory ? 'No frames found with selected category.' : 'No frames available.'}
        </EmptyState>
      ) : (
        <FramesGrid $columns={GRID_CONFIG.FRAME_LIBRARY_COLUMNS} $gap={GRID_CONFIG.GAP}>
          {filteredFrames.map((frame) => (
            <FrameItem
              key={frame.id}
              frame={frame}
              size={SIZES.FRAME_ITEM}
              overlayValue={
                (isVideoFile(frame.mimeType || undefined) && `${frame.duration}s`) || undefined
              }
              playOnHover={true}
              usePreviewUrl={true}
              showVideoOnHover={true}
              onClick={() => handleFrameClick(frame)}
              isSelected={clickedFrameId === frame.id}
              disabled={disabled}
            />
          ))}
        </FramesGrid>
      )}
    </ComponentContainer>
  )
}

export default FrameLibrary
