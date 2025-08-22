'use client'

import React, { useCallback } from 'react'
import type { FrameData } from './types'
import { useFrameDetails } from './hooks/useFrameDetails'
import {
  validateTimestamp,
  sortFramesByTimestamp,
  isVideoFile,
  getMediaUrl,
  createFrameKey,
} from './utils'
import { SIZES } from './constants'
import {
  ComponentContainer,
  ComponentHeader,
  FrameManagerList,
  FrameManagerItem,
  FrameThumbnail,
  FrameInfo,
  FrameInfoTitle,
  FrameInfoSubtext,
  TimestampInput,
  TimestampError,
  Button,
  EmptyState,
} from './styled'

interface FrameManagerProps {
  frames: FrameData[]
  onFramesChange: (frames: FrameData[]) => void
  readOnly?: boolean
}

const FrameManager: React.FC<FrameManagerProps> = ({
  frames,
  onFramesChange,
  readOnly = false,
}) => {
  const frameIds = frames.map((f) => f.frame)
  const { frameDetails, isLoading } = useFrameDetails(frameIds)

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

  if (frames.length === 0) {
    return (
      <ComponentContainer>
        <ComponentHeader>Current Frames (0)</ComponentHeader>
        <EmptyState>
          No frames added yet. Select frames from the library below to add them at the current audio
          timestamp.
        </EmptyState>
      </ComponentContainer>
    )
  }

  return (
    <ComponentContainer>
      <ComponentHeader>Current Frames ({frames.length})</ComponentHeader>

      <FrameManagerList>
        {frames.map((frameData, index) => {
          const frame = frameDetails[frameData.frame]
          const timestampError = getTimestampError(frameData.timestamp, index)

          return (
            <FrameManagerItem
              key={createFrameKey(frameData.frame, frameData.timestamp, index)}
              $isLast={index === frames.length - 1}
            >
              {/* Frame Preview */}
              <FrameThumbnail $size={SIZES.FRAME_THUMBNAIL}>
                {frame?.url ? (
                  isVideoFile(frame.mimeType || undefined) ? (
                    <video
                      src={frame.url || ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      muted
                    />
                  ) : (
                    <img
                      src={getMediaUrl(frame, 'small') || frame.url || ''}
                      alt={frame.category}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      color: 'var(--theme-elevation-500)',
                      fontSize: '0.625rem',
                    }}
                  >
                    {isLoading ? '...' : 'N/A'}
                  </div>
                )}
              </FrameThumbnail>

              {/* Frame Info */}
              <FrameInfo>
                <FrameInfoTitle>{frame?.category || `Frame ${frameData.frame}`}</FrameInfoTitle>
                {frame && isVideoFile(frame.mimeType || undefined) && frame.duration && (
                  <FrameInfoSubtext>{frame.duration}s video</FrameInfoSubtext>
                )}
              </FrameInfo>

              {/* Timestamp Input */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '0.125rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <TimestampInput
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
                    disabled={readOnly}
                    $hasError={!!timestampError}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--theme-elevation-600)' }}>s</span>
                </div>
                {timestampError && <TimestampError>{timestampError}</TimestampError>}
              </div>

              {/* Remove Button */}
              <Button
                type="button"
                onClick={() => handleRemoveFrame(index)}
                disabled={readOnly}
                variant={readOnly ? 'disabled' : 'error'}
                style={{
                  padding: '0.2rem 0.4rem',
                  fontSize: '0.7rem',
                  flexShrink: 0,
                  minWidth: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Remove frame"
              >
                ×
              </Button>
            </FrameManagerItem>
          )
        })}
      </FrameManagerList>
    </ComponentContainer>
  )
}

export default FrameManager
