'use client'

import React, { useCallback } from 'react'
import type { KeyframeData } from './types'
import FrameItem from './FrameItem'
import { validateTimestamp, sortFramesByTimestamp, isVideoFile } from './utils'
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

interface FrameManagerProps {
  frames: KeyframeData[]
  onFramesChange: (frames: KeyframeData[]) => void
  readOnly?: boolean
}

const FrameManager: React.FC<FrameManagerProps> = ({
  frames,
  onFramesChange,
  readOnly = false,
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
          const timestampError = getTimestampError(frameData.timestamp, index)

          return (
            <FrameManagerItem
              key={`${frameData?.id}-${frameData.timestamp}`}
              $isLast={index === frames.length - 1}
            >
              {/* Frame Preview */}
              <FrameThumbnail $size={SIZES.FRAME_THUMBNAIL}>
                <FrameItem
                  frame={frameData}
                  size={SIZES.FRAME_THUMBNAIL}
                  usePreviewUrl={true}
                  showVideoOnHover={false}
                  playOnHover={false}
                />
              </FrameThumbnail>

              {/* Frame Info */}
              <FrameInfo>
                <FrameInfoTitle>{frameData.category || `Frame ${frameData.id}`}</FrameInfoTitle>
                {frameData &&
                  isVideoFile(frameData.mimeType || undefined) &&
                  frameData.duration && (
                    <FrameInfoSubtext>{frameData.duration}s video</FrameInfoSubtext>
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
                {timestampError && <TimestampError>{timestampError}</TimestampError>}
              </div>

              {/* Remove Button */}
              <Button
                type="button"
                onClick={() => handleRemoveFrame(index)}
                disabled={readOnly}
                variant={readOnly ? 'disabled' : 'error'}
                style={{
                  padding: '0.25rem',
                  flexShrink: 0,
                  minWidth: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '0.75rem',
                }}
                title="Remove frame"
              >
                <TrashIcon size={14} />
              </Button>
            </FrameManagerItem>
          )
        })}
      </FrameManagerList>
    </ComponentContainer>
  )
}

export default FrameManager
