'use client'

import React, { useCallback } from 'react'
import type { KeyframeData } from './types'
import { validateTimestamp, sortFramesByTimestamp, isVideoFile } from './utils'
import {
  ComponentContainer,
  ComponentHeader,
  FrameManagerList,
  FrameManagerItem,
  FrameManagerPillIcon,
  FrameManagerPillTitle,
  FrameManagerPillTimestamp,
  FrameManagerPillRemove,
  EmptyState,
} from './styled'

const TrashIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 512 512"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M94.296,463.359C95.853,490.118,119.045,512,145.837,512h218.3c26.792,0,49.992-21.882,51.55-48.641l17.746-306.165H76.542L94.296,463.359z" />
    <path d="M433.696,80.591c-5.446-2.34-52.875-19.6-124.124-26.059c0.009-0.322,0.026-0.634,0.026-0.948C309.589,23.983,285.597,0,256.004,0c-29.602,0-53.592,23.983-53.6,53.584c0,0.313,0.017,0.626,0.024,0.948C131.18,60.991,83.734,78.251,78.297,80.591c-9.491,4.07-10.851,9.491-10.851,17.63v35.278h377.108v-35.278C444.554,90.082,443.195,84.661,433.696,80.591z M255.996,52.102c-7.909,0-15.612,0.173-23.142,0.47c0.56-12.326,10.685-22.154,23.15-22.17c12.457,0.016,22.583,9.844,23.143,22.17C271.616,52.274,263.913,52.102,255.996,52.102z" />
  </svg>
)

const ImageIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
)

const VideoIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
)

interface FrameManagerProps {
  frames: KeyframeData[]
  onFramesChange: (frames: KeyframeData[]) => void
  readOnly?: boolean
  currentTime?: number
  onSeekToFrame?: (timestamp: number) => void
}

const FrameManager: React.FC<FrameManagerProps> = ({
  frames,
  onFramesChange,
  readOnly = false,
  currentTime = 0,
  onSeekToFrame,
}) => {
  const handleTimestampChange = useCallback(
    (index: number, newTimestamp: number) => {
      const updatedFrames = [...frames]
      updatedFrames[index] = { ...updatedFrames[index], timestamp: newTimestamp }
      onFramesChange(sortFramesByTimestamp(updatedFrames))
    },
    [frames, onFramesChange],
  )

  const handleRemoveFrame = useCallback(
    (index: number) => {
      const updatedFrames = frames.filter((_, i) => i !== index)
      onFramesChange(updatedFrames)
    },
    [frames, onFramesChange],
  )

  const getTimestampError = useCallback(
    (timestamp: number, currentIndex: number): string | null => {
      const existingTimestamps = frames.map((f) => f.timestamp)
      return validateTimestamp(timestamp, existingTimestamps, currentIndex)
    },
    [frames],
  )

  const handlePillClick = useCallback(
    (timestamp: number) => {
      if (onSeekToFrame && !readOnly) {
        onSeekToFrame(timestamp)
      }
    },
    [onSeekToFrame, readOnly],
  )

  // Determine which frame is currently active based on currentTime
  const getActiveFrameIndex = useCallback((): number => {
    if (frames.length === 0) return -1

    // Find the frame with the largest timestamp that is <= currentTime
    let activeIndex = 0
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].timestamp <= currentTime) {
        activeIndex = i
      } else {
        break
      }
    }
    return activeIndex
  }, [frames, currentTime])

  if (frames.length === 0) {
    return (
      <ComponentContainer>
        <ComponentHeader>Current Frames (0)</ComponentHeader>
        <EmptyState>
          No frames added yet. Select your first frame from the library on the right.
        </EmptyState>
      </ComponentContainer>
    )
  }

  const activeFrameIndex = getActiveFrameIndex()

  return (
    <ComponentContainer>
      <ComponentHeader>Current Frames ({frames.length})</ComponentHeader>

      <FrameManagerList>
        {frames.map((frameData, index) => {
          const timestampError = getTimestampError(frameData.timestamp, index)
          const isActive = index === activeFrameIndex

          // Check if frame is video
          const isVideo = isVideoFile(frameData.mimeType)

          // Format tags for display (truncate if needed)
          const tagsText =
            frameData.tags && frameData.tags.length > 0 ? frameData.tags.join(', ') : ''

          // Create title with category and tags
          const displayTitle = frameData.category || `Frame ${frameData.id}`
          const fullTitle = tagsText ? `${displayTitle} • ${tagsText}` : displayTitle

          return (
            <FrameManagerItem
              key={`${frameData?.id}-${frameData.timestamp}`}
              $isLast={index === frames.length - 1}
              $isActive={isActive}
              $isClickable={!!onSeekToFrame && !readOnly}
              onClick={() => handlePillClick(frameData.timestamp)}
            >
              {/* Icon - Left side of pill */}
              <FrameManagerPillIcon>
                {isVideo ? <VideoIcon size={14} /> : <ImageIcon size={14} />}
              </FrameManagerPillIcon>

              {/* Title with Tags - Center of pill */}
              <FrameManagerPillTitle title={fullTitle}>
                <span style={{ fontWeight: 500 }}>{displayTitle}</span>
                {tagsText && (
                  <span style={{ opacity: 0.6, fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                    • {tagsText}
                  </span>
                )}
              </FrameManagerPillTitle>

              {/* Timestamp - Right-center of pill */}
              <FrameManagerPillTimestamp
                type="number"
                min="0"
                max="3600"
                step="1"
                value={frameData.timestamp}
                onChange={(e) => {
                  const newTimestamp = parseInt(e.target.value) || 0
                  const error = getTimestampError(newTimestamp, index)
                  if (!error) {
                    handleTimestampChange(index, newTimestamp)
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                disabled={readOnly}
                title={timestampError || 'Frame will be shown at this second'}
              />

              {/* Remove Button - Right side of pill */}
              <FrameManagerPillRemove
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveFrame(index)
                }}
                disabled={readOnly}
                title="Remove frame"
              >
                <TrashIcon size={12} />
              </FrameManagerPillRemove>
            </FrameManagerItem>
          )
        })}
      </FrameManagerList>
    </ComponentContainer>
  )
}

export default FrameManager
