'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import type { Frame, Narrator } from '@/payload-types'
import { FRAME_CATEGORIES } from '@/lib/data'
import FrameItem from './FrameItem'
import { isVideoFile } from './utils'
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
} from './styled'

interface FrameLibraryProps {
  narrator: Narrator | null
  onFrameSelect: (frame: Frame) => void
  disabled?: boolean
}

const FrameLibrary: React.FC<FrameLibraryProps> = ({
  narrator,
  onFrameSelect,
  disabled = false,
}) => {
  const [frames, setFrames] = useState<Frame[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
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

  // Filter frames by selected categories
  const filteredFrames = useMemo(() => {
    if (selectedCategories.length === 0) return frames
    return frames.filter((frame) => selectedCategories.includes(frame.category))
  }, [frames, selectedCategories])

  const handleCategoryToggle = useCallback((category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((id) => id !== category) : [...prev, category],
    )
  }, [])

  const clearCategoryFilters = useCallback(() => {
    setSelectedCategories([])
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

      {/* Category Filters */}
      <CategoryFilters>
        {FRAME_CATEGORIES.map((category) => (
          <CategoryButton
            key={category}
            type="button"
            onClick={() => handleCategoryToggle(category)}
            disabled={disabled}
            $selected={selectedCategories.includes(category)}
            $disabled={disabled}
          >
            {category}
          </CategoryButton>
        ))}
        {selectedCategories.length > 0 && (
          <ClearFiltersButton
            type="button"
            onClick={clearCategoryFilters}
            disabled={disabled}
            $disabled={disabled}
          >
            Clear filters
          </ClearFiltersButton>
        )}
      </CategoryFilters>

      {/* Frames Grid */}
      {filteredFrames.length === 0 ? (
        <EmptyState>
          {selectedCategories.length > 0
            ? 'No frames found with selected categories.'
            : 'No frames available.'}
        </EmptyState>
      ) : (
        <FramesGrid $columns={GRID_CONFIG.FRAME_LIBRARY_COLUMNS} $gap={GRID_CONFIG.GAP}>
          {filteredFrames.map((frame) => (
            <FrameItem
              key={frame.id}
              frame={frame}
              size={SIZES.FRAME_ITEM}
              overlayValue={
                (isVideoFile(frame.mimeType || undefined) && frame.duration) || undefined
              }
              playOnHover={true}
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
