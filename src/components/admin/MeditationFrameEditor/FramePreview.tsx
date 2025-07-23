'use client'

import React, { useState, useEffect, useMemo } from 'react'
import type { FrameData } from './types'
import type { Frame } from '@/payload-types'

interface FramePreviewProps {
  frames: FrameData[]
  currentTime: number
  width?: number
  height?: number
}

const FramePreview: React.FC<FramePreviewProps> = ({
  frames,
  currentTime,
  width = 300,
  height = 225,
}) => {
  const [frameDetails, setFrameDetails] = useState<{ [key: string]: Frame }>({})
  const [isLoading, setIsLoading] = useState(false)

  // Load frame details
  useEffect(() => {
    const loadFrameDetails = async () => {
      const frameIds = frames.map(f => f.frame)
      const missingIds = frameIds.filter(id => !frameDetails[id])
      
      if (missingIds.length === 0) return

      setIsLoading(true)
      try {
        const promises = missingIds.map(async (id) => {
          try {
            const response = await fetch(`/api/frames/${id}`)
            if (response.ok) {
              const frame = await response.json()
              return { id, frame }
            }
          } catch (error) {
            console.error(`Failed to load frame ${id}:`, error)
          }
          return null
        })

        const results = await Promise.all(promises)
        const newFrameDetails = { ...frameDetails }
        
        results.forEach(result => {
          if (result) {
            newFrameDetails[result.id] = result.frame
          }
        })
        
        setFrameDetails(newFrameDetails)
      } catch (error) {
        console.error('Failed to load frame details:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadFrameDetails()
  }, [frames, frameDetails])

  // Find the current frame based on audio timestamp
  const currentFrame = useMemo(() => {
    if (frames.length === 0) return null

    // Sort frames by timestamp
    const sortedFrames = [...frames].sort((a, b) => a.timestamp - b.timestamp)
    
    // Find the latest frame that should be showing at the current time
    let activeFrame = null
    for (const frame of sortedFrames) {
      if (frame.timestamp <= currentTime) {
        activeFrame = frame
      } else {
        break // Frames are sorted, so we can stop here
      }
    }
    
    return activeFrame
  }, [frames, currentTime])

  const currentFrameDetails = currentFrame ? frameDetails[currentFrame.frame] : null

  // No frames available
  if (frames.length === 0) {
    return (
      <div className="frame-preview">
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>
          Live Preview
        </h4>
        <div
          style={{
            width: `${width}px`,
            height: `${height}px`,
            backgroundColor: '#f8f9fa',
            border: '2px dashed #dee2e6',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6c757d',
            textAlign: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📽️</div>
          <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>No frames added</div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Add frames to see the slideshow preview
          </div>
        </div>
      </div>
    )
  }

  // Loading frame details
  if (isLoading && Object.keys(frameDetails).length === 0) {
    return (
      <div className="frame-preview">
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>
          Live Preview
        </h4>
        <div
          style={{
            width: `${width}px`,
            height: `${height}px`,
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6c757d',
          }}
        >
          Loading frames...
        </div>
      </div>
    )
  }

  // No current frame at this timestamp
  if (!currentFrame) {
    return (
      <div className="frame-preview">
        <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>
          Live Preview
        </h4>
        <div
          style={{
            width: `${width}px`,
            height: `${height}px`,
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#6c757d',
            textAlign: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>⏱️</div>
          <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>
            No frame at {currentTime}s
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Next frame at {Math.min(...frames.filter(f => f.timestamp > currentTime).map(f => f.timestamp))}s
          </div>
        </div>
      </div>
    )
  }

  // Show current frame
  return (
    <div className="frame-preview">
      <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600' }}>
        Live Preview
        <span style={{ fontSize: '0.875rem', fontWeight: 'normal', color: '#666', marginLeft: '0.5rem' }}>
          ({currentTime}s)
        </span>
      </h4>
      
      <div
        style={{
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: '#000',
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid #dee2e6',
        }}
      >
        {currentFrameDetails?.url ? (
          currentFrameDetails.mimeType?.startsWith('video/') ? (
            <video
              src={currentFrameDetails.url}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
              muted
              loop
              autoPlay
            />
          ) : (
            <img
              src={currentFrameDetails.url}
              alt={currentFrameDetails.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          )
        ) : (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#fff',
            textAlign: 'center',
            fontSize: '0.875rem'
          }}>
            {isLoading ? 'Loading...' : 'Frame not available'}
          </div>
        )}

        {/* Frame info overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
            color: '#fff',
            padding: '1rem 0.75rem 0.5rem',
            fontSize: '0.75rem',
          }}
        >
          <div style={{ fontWeight: '500' }}>
            {currentFrameDetails?.name || 'Unknown Frame'}
          </div>
          <div style={{ opacity: 0.8 }}>
            Frame {frames.findIndex(f => f === currentFrame) + 1} of {frames.length} • {currentFrame.timestamp}s
            {currentFrameDetails?.mimeType?.startsWith('video/') && currentFrameDetails.duration && (
              <span> • {currentFrameDetails.duration}s video</span>
            )}
          </div>
        </div>
      </div>

      {/* Frame timeline indicator */}
      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#666' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <span>Timeline:</span>
          <span>{frames.length} frame{frames.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ 
          width: '100%', 
          height: '4px', 
          backgroundColor: '#e9ecef', 
          borderRadius: '2px',
          position: 'relative'
        }}>
          {/* Frame position indicators */}
          {frames.map((frame, index) => {
            const maxTime = Math.max(...frames.map(f => f.timestamp), 60) // At least 60s for visualization
            const position = (frame.timestamp / maxTime) * 100
            const isActive = frame === currentFrame
            
            return (
              <div
                key={`${frame.frame}-${frame.timestamp}`}
                style={{
                  position: 'absolute',
                  left: `${position}%`,
                  top: 0,
                  width: '4px',
                  height: '4px',
                  backgroundColor: isActive ? '#007bff' : '#6c757d',
                  borderRadius: '2px',
                  transform: 'translateX(-2px)',
                  zIndex: isActive ? 2 : 1,
                }}
                title={`Frame ${index + 1}: ${frame.timestamp}s - ${currentFrameDetails?.name || 'Unknown'}`}
              />
            )
          })}
          
          {/* Current time indicator */}
          <div
            style={{
              position: 'absolute',
              left: `${(currentTime / Math.max(...frames.map(f => f.timestamp), 60)) * 100}%`,
              top: '-2px',
              width: '2px',
              height: '8px',
              backgroundColor: '#dc3545',
              transform: 'translateX(-1px)',
              zIndex: 3,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default FramePreview