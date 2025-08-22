'use client'

import React, { useMemo } from 'react'
import type { FrameData } from './types'
import { useFrameDetails } from './hooks/useFrameDetails'
import { getCurrentFrame, getNextFrameTimestamp, isVideoFile, getMediaUrl, createFrameKey } from './utils'
import { COLORS } from './constants'
import { 
  ComponentHeader,
  ComponentHeaderCount,
  LoadingState,
  PreviewContainer,
  TimelineTrack,
  TimelineMarker
} from './styled'

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
  const frameIds = frames.map(f => f.frame)
  const { frameDetails, isLoading } = useFrameDetails(frameIds)

  // Find the current frame based on audio timestamp
  const currentFrame = getCurrentFrame(frames, currentTime)
  const currentFrameDetails = currentFrame ? frameDetails[currentFrame.frame] : null
  const nextFrameTime = getNextFrameTimestamp(frames, currentTime)

  // Timeline visualization
  const timelineConfig = useMemo(() => {
    const maxTime = Math.max(...frames.map((f) => f.timestamp), 60)
    return {
      maxTime,
      currentTimePosition: (currentTime / maxTime) * 100,
      framePositions: frames.map((frame, index) => ({
        frame,
        index,
        position: (frame.timestamp / maxTime) * 100,
        isActive: frame === currentFrame,
      })),
    }
  }, [frames, currentTime, currentFrame])

  // No frames available
  if (frames.length === 0) {
    return (
      <div>
        <ComponentHeader>Live Preview</ComponentHeader>
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
      <div>
        <ComponentHeader>Live Preview</ComponentHeader>
        <LoadingState style={{ width: `${width}px`, height: `${height}px` }}>
          Loading frames...
        </LoadingState>
      </div>
    )
  }

  // No current frame at this timestamp
  if (!currentFrame) {
    return (
      <div>
        <ComponentHeader>Live Preview</ComponentHeader>
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
          <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>No frame at {Math.round(currentTime)}s</div>
          {nextFrameTime && (
            <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Next frame at {nextFrameTime}s
            </div>
          )}
        </div>
      </div>
    )
  }

  // Show current frame
  return (
    <div>
      <ComponentHeader>
        Live Preview
        <ComponentHeaderCount>
          ({Math.round(currentTime)}s)
        </ComponentHeaderCount>
      </ComponentHeader>

      <PreviewContainer
        $width={width}
        $height={height}
      >
        {currentFrameDetails?.url ? (
          isVideoFile(currentFrameDetails.mimeType || undefined) ? (
            <video
              src={currentFrameDetails.url || ''}
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
              src={getMediaUrl(currentFrameDetails, 'medium') || currentFrameDetails.url || ''}
              alt={currentFrameDetails.category}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
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
              color: '#fff',
              textAlign: 'center',
              fontSize: '0.875rem',
            }}
          >
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
            {currentFrameDetails?.category || 'Unknown Frame'}
          </div>
          <div style={{ opacity: 0.8 }}>
            Frame {frames.findIndex((f) => f === currentFrame) + 1} of {frames.length} •{' '}
            {currentFrame.timestamp}s
            {currentFrameDetails && isVideoFile(currentFrameDetails.mimeType || undefined) && currentFrameDetails.duration && (
              <span> • {currentFrameDetails.duration}s video</span>
            )}
          </div>
        </div>
      </PreviewContainer>

      {/* Frame timeline indicator */}
      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#666' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
          <span>Timeline:</span>
          <span>
            {frames.length} frame{frames.length !== 1 ? 's' : ''}
          </span>
        </div>
        <TimelineTrack>
          {/* Frame position indicators */}
          {timelineConfig.framePositions.map(({ frame, index, position, isActive }) => (
            <TimelineMarker
              key={createFrameKey(frame.frame, frame.timestamp)}
              $left={position}
              $isActive={isActive}
              title={`Frame ${index + 1}: ${frame.timestamp}s - ${frameDetails[frame.frame]?.category || 'Unknown'}`}
            />
          ))}

          {/* Current time indicator */}
          <div
            style={{
              position: 'absolute',
              left: `${timelineConfig.currentTimePosition}%`,
              top: '-2px',
              width: '2px',
              height: '8px',
              backgroundColor: COLORS.ERROR,
              transform: 'translateX(-1px)',
              zIndex: 3,
            }}
          />
        </TimelineTrack>
      </div>
    </div>
  )
}

export default FramePreview
