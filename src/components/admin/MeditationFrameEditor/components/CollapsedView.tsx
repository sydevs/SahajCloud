'use client'

import React from 'react'
import AudioPlayer from '../AudioPlayer'
import FrameItem from '../FrameItem'
import type { KeyframeData } from '../types'
import { formatTime, sortFramesByTimestamp } from '../utils'
import {
  CollapsedView as StyledCollapsedView,
  CollapsedRight,
  SelectedFramesContainer,
  SelectedFramesTitle,
  SelectedFramesGrid,
  EditButtonContainer,
  EditButton,
  EditButtonMessage,
} from '../styled'

interface CollapsedViewProps {
  frames: KeyframeData[]
  audioUrl: string | null
  onEditClick: () => void
  readOnly?: boolean
}

const CollapsedView: React.FC<CollapsedViewProps> = ({
  frames,
  audioUrl,
  onEditClick,
  readOnly = false,
}) => {
  const sortedFrames = sortFramesByTimestamp(frames)

  return (
    <StyledCollapsedView>
      {/* Audio Preview Player */}
      <AudioPlayer
        audioUrl={audioUrl}
        frames={frames}
        size="small"
        enableHotkeys={false}
        showPreview={true}
      />

      {/* Right Side - Selected Frames and Edit Button */}
      <CollapsedRight>
        {/* Selected Frames Thumbnail Grid */}
        {frames.length > 0 && (
          <SelectedFramesContainer>
            <SelectedFramesTitle>Selected Frames ({frames.length})</SelectedFramesTitle>
            <SelectedFramesGrid>
              {sortedFrames.map((frameData, index) => {
                return (
                  <FrameItem
                    key={`${frameData.id}-${frameData.timestamp}-${index}`}
                    frame={frameData}
                    size={120}
                    overlayValue={formatTime(frameData.timestamp)}
                    usePreviewUrl={true}
                    showVideoOnHover={false}
                    playOnHover={false}
                  />
                )
              })}
            </SelectedFramesGrid>
          </SelectedFramesContainer>
        )}

        {/* Edit Button and Info */}
        <EditButtonContainer>
          <EditButton type="button" disabled={!audioUrl || readOnly} onClick={onEditClick}>
            Edit Video
          </EditButton>

          {!audioUrl && (
            <EditButtonMessage>Please upload an audio file first to edit frames.</EditButtonMessage>
          )}
        </EditButtonContainer>
      </CollapsedRight>
    </StyledCollapsedView>
  )
}

export default CollapsedView
