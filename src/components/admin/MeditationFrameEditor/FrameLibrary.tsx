'use client'

import React, { useState, useEffect, useMemo } from 'react'
import type { Frame, Narrator } from '@/payload-types'
import { FRAME_CATEGORIES } from '@/lib/data'
import FrameItem from './FrameItem'

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

  // Load frames and tags
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Load frames with gender filtering
        let framesUrl = '/api/frames?limit=1000'
        if (narrator?.gender) {
          framesUrl += `&where[imageSet][equals]=${narrator.gender}`
        }

        const framesResponse = await fetch(framesUrl)
        if (!framesResponse.ok) throw new Error('Failed to load frames')
        const framesData = await framesResponse.json()
        setFrames(framesData.docs || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [narrator?.gender])

  // Filter frames by selected categories
  const filteredFrames = useMemo(() => {
    if (selectedCategories.length === 0) return frames

    return frames.filter((frame) => {
      // Filter by frame.category which matches FRAME_CATEGORIES
      return selectedCategories.includes(frame.category)
    })
  }, [frames, selectedCategories])

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((id) => id !== category) : [...prev, category],
    )
  }

  const clearCategoryFilters = () => {
    setSelectedCategories([])
  }

  const handleFrameClick = (frame: Frame) => {
    if (disabled) return

    // Trigger click animation
    setClickedFrameId(frame.id)

    // Clear animation after 300ms
    setTimeout(() => {
      setClickedFrameId(null)
    }, 300)

    // Call the selection handler
    onFrameSelect(frame)
  }

  if (isLoading) {
    return (
      <div className="frame-library loading">
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600', color: 'var(--theme-text)' }}>
          Frame Library
        </h4>
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: 'var(--theme-elevation-50)',
            borderRadius: 'var(--style-radius-m)',
            color: 'var(--theme-text)',
          }}
        >
          Loading frames...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="frame-library error">
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600', color: 'var(--theme-text)' }}>
          Frame Library
        </h4>
        <div
          style={{
            padding: '1rem',
            backgroundColor: 'var(--theme-error-50)',
            color: 'var(--theme-error-950)',
            borderRadius: 'var(--style-radius-m)',
          }}
        >
          Error: {error}
        </div>
      </div>
    )
  }

  return (
    <div
      className="frame-library"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600', flexShrink: 0, color: 'var(--theme-text)' }}>
        Frame Library ({filteredFrames.length} frames)
        {narrator?.gender && (
          <span
            style={{
              fontSize: '0.875rem',
              fontWeight: 'normal',
              color: 'var(--theme-elevation-600)',
              marginLeft: '0.5rem',
            }}
          >
            Filtered for {narrator.gender} poses
          </span>
        )}
      </h4>

      {/* Category Filters */}
      <div className="category-filters" style={{ marginBottom: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          {FRAME_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => handleCategoryToggle(category)}
              disabled={disabled}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                border: '1px solid var(--theme-border-color)',
                borderRadius: '12px',
                backgroundColor: selectedCategories.includes(category) ? 'var(--theme-success-400)' : 'var(--theme-bg)',
                color: selectedCategories.includes(category) ? 'white' : 'var(--theme-text)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {category}
            </button>
          ))}
          {selectedCategories.length > 0 && (
            <button
              type="button"
              onClick={clearCategoryFilters}
              disabled={disabled}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                backgroundColor: 'transparent',
                color: 'var(--theme-error-400)',
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                textDecoration: 'underline',
                marginLeft: '4px',
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Frames Grid */}
      {filteredFrames.length === 0 ? (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: 'var(--theme-elevation-50)',
            border: '1px dashed var(--theme-border-color)',
            borderRadius: 'var(--style-radius-m)',
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--theme-elevation-600)',
          }}
        >
          {selectedCategories.length > 0
            ? 'No frames found with selected categories.'
            : 'No frames available.'}
        </div>
      ) : (
        <div
          className="frames-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: '16px',
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            backgroundColor: 'var(--theme-elevation-50)',
            borderRadius: 'var(--style-radius-m)',
            border: '1px solid var(--theme-border-color)',
            minHeight: 0, // Allow grid to shrink below content size
          }}
        >
          {filteredFrames.map((frame) => {
            const isClicked = clickedFrameId === frame.id

            return (
              <FrameItem
                key={frame.id}
                frame={frame}
                size={160}
                overlayValue={frame.mimeType?.startsWith('video/') ? Math.round(frame.duration || 0) : undefined}
                playOnHover={true}
                onClick={() => handleFrameClick(frame)}
                isSelected={isClicked}
                disabled={disabled}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default FrameLibrary
