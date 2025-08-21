'use client'

import React, { useState, useEffect, useMemo } from 'react'
import type { Frame, Narrator } from '@/payload-types'
import { FRAME_CATEGORIES } from '@/lib/data'

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
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>
          Frame Library
        </h4>
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px',
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
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>
          Frame Library
        </h4>
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            borderRadius: '4px',
          }}
        >
          Error: {error}
        </div>
      </div>
    )
  }

  return (
    <div className="frame-library">
      <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>
        Frame Library ({filteredFrames.length} frames)
        {narrator?.gender && (
          <span
            style={{
              fontSize: '0.875rem',
              fontWeight: 'normal',
              color: '#666',
              marginLeft: '0.5rem',
            }}
          >
            Filtered for {narrator.gender} poses
          </span>
        )}
      </h4>

      {/* Category Filters */}
      <div className="category-filters" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
          {FRAME_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => handleCategoryToggle(category)}
              disabled={disabled}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '12px',
                backgroundColor: selectedCategories.includes(category) ? '#007bff' : '#fff',
                color: selectedCategories.includes(category) ? '#fff' : '#333',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {category}
            </button>
          ))}
        </div>
        {selectedCategories.length > 0 && (
          <button
            type="button"
            onClick={clearCategoryFilters}
            disabled={disabled}
            style={{
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              backgroundColor: 'transparent',
              color: '#dc3545',
              border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              textDecoration: 'underline',
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Frames Grid */}
      {filteredFrames.length === 0 ? (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: '#f8f9fa',
            border: '1px dashed #ccc',
            borderRadius: '4px',
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
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '16px',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px',
            border: '1px solid #e0e0e0',
          }}
        >
          {filteredFrames.map((frame) => {
            const isClicked = clickedFrameId === frame.id
            // Use small size for images, fallback to full URL
            const imageUrl = frame.sizes?.small?.url || frame.url
            
            return (
              <div
                key={frame.id}
                className="frame-item"
                style={{
                  maxWidth: '160px',
                  border: isClicked ? '2px solid #28a745' : '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: isClicked ? '#f8fff9' : '#fff',
                  overflow: 'hidden',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                  transition: 'all 0.2s ease-in-out',
                  transform: isClicked ? 'scale(1.08)' : 'scale(1)',
                  boxShadow: isClicked ? '0 6px 12px rgba(40, 167, 69, 0.3)' : 'none',
                }}
                onClick={() => handleFrameClick(frame)}
                onMouseEnter={(e) => {
                  if (!disabled && !isClicked) {
                    e.currentTarget.style.transform = 'scale(1.05)'
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!disabled && !isClicked) {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.boxShadow = 'none'
                  }
                }}
              >
                {/* Frame Preview - Square aspect ratio */}
                <div
                  style={{
                    position: 'relative',
                    width: '160px',
                    height: '160px',
                    backgroundColor: '#f0f0f0',
                  }}
                >
                  {imageUrl ? (
                    frame.mimeType?.startsWith('video/') ? (
                      <video
                        src={frame.url || undefined}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                        muted
                        loop
                        autoPlay={false}
                        onMouseEnter={(e) => e.currentTarget.play()}
                        onMouseLeave={(e) => e.currentTarget.pause()}
                      />
                    ) : (
                      <img
                        src={imageUrl}
                        alt={frame.category || undefined}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    )
                  ) : (
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: '#999',
                        fontSize: '0.75rem',
                      }}
                    >
                      No preview
                    </div>
                  )}
                </div>

                {/* Frame Info */}
                <div style={{ padding: '0.5rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    {frame.category}
                    <br />
                    {frame.tags?.map((f) => (typeof f === 'string' ? f : f.name)).join(', ')}
                  </div>
                  {frame.mimeType?.startsWith('video/') && frame.duration && (
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>
                      {frame.duration}s video
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default FrameLibrary
