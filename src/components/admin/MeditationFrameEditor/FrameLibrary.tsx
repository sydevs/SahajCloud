'use client'

import React, { useState, useEffect, useMemo } from 'react'
import type { Frame, Tag, Narrator } from '@/payload-types'

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
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clickedFrameId, setClickedFrameId] = useState<string | null>(null)

  // Load frames and tags
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Load all tags first
        const tagsResponse = await fetch('/api/tags?limit=1000')
        if (!tagsResponse.ok) throw new Error('Failed to load tags')
        const tagsData = await tagsResponse.json()
        setTags(tagsData.docs || [])

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

  // Filter frames by selected tags
  const filteredFrames = useMemo(() => {
    if (selectedTags.length === 0) return frames

    return frames.filter(frame => {
      const frameTags = frame.tags || []
      return selectedTags.some(selectedTagId => 
        frameTags.some(tag => 
          typeof tag === 'string' ? tag === selectedTagId : tag.id === selectedTagId
        )
      )
    })
  }, [frames, selectedTags])

  const handleTagToggle = (tagId: string) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  const clearTagFilters = () => {
    setSelectedTags([])
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
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>Frame Library</h4>
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          Loading frames...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="frame-library error">
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>Frame Library</h4>
        <div style={{ padding: '1rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '4px' }}>
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
          <span style={{ fontSize: '0.875rem', fontWeight: 'normal', color: '#666', marginLeft: '0.5rem' }}>
            Filtered for {narrator.gender} poses
          </span>
        )}
      </h4>

      {/* Tag Filters */}
      {tags.length > 0 && (
        <div className="tag-filters" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            {tags.map(tag => (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleTagToggle(tag.id)}
                disabled={disabled}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '12px',
                  backgroundColor: selectedTags.includes(tag.id) ? '#007bff' : '#fff',
                  color: selectedTags.includes(tag.id) ? '#fff' : '#333',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                {tag.title}
              </button>
            ))}
          </div>
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={clearTagFilters}
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
      )}

      {/* Frames Grid */}
      {filteredFrames.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8f9fa', border: '1px dashed #ccc', borderRadius: '4px' }}>
          {selectedTags.length > 0 ? 'No frames found with selected tags.' : 'No frames available.'}
        </div>
      ) : (
        <div className="frames-grid" style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', 
          gap: '16px',
          maxHeight: '400px',
          overflowY: 'auto',
          padding: '16px',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          border: '1px solid #e0e0e0'
        }}>
          {filteredFrames.map(frame => {
            const isClicked = clickedFrameId === frame.id
            return (
              <div
                key={frame.id}
                className="frame-item"
                style={{
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
              <div style={{ position: 'relative', paddingBottom: '100%', backgroundColor: '#f0f0f0' }}>
                {frame.url ? (
                  frame.mimeType?.startsWith('video/') ? (
                    <video
                      src={frame.url}
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
                      src={frame.url}
                      alt={frame.name}
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
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#999',
                    fontSize: '0.75rem'
                  }}>
                    No preview
                  </div>
                )}
              </div>

              {/* Frame Info */}
              <div style={{ padding: '0.5rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                  {frame.name}
                </div>
                {frame.mimeType?.startsWith('video/') && frame.duration && (
                  <div style={{ fontSize: '0.75rem', color: '#666' }}>
                    {frame.duration}s video
                  </div>
                )}
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  )
}

export default FrameLibrary