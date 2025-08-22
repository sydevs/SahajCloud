'use client'

import React from 'react'
import AudioPlayer from '../AudioPlayer'
import FrameItem from '../FrameItem'
import type { FrameData } from '../types'
import { useFrameDetails } from '../hooks/useFrameDetails'
import { sortFramesByTimestamp } from '../utils'
import { 
  CollapsedView as StyledCollapsedView,
  CollapsedRight,
  SelectedFramesContainer,
  SelectedFramesTitle,
  SelectedFramesGrid,
  EditButtonContainer,
  EditButton,
  EditButtonMessage
} from '../styled'

interface CollapsedViewProps {
  frames: FrameData[]
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
  const frameIds = frames.map(f => f.frame)
  const { frameDetails } = useFrameDetails(frameIds)
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
            <SelectedFramesTitle>
              Selected Frames ({frames.length})
            </SelectedFramesTitle>
            <SelectedFramesGrid>
              {sortedFrames.map((frameData, index) => {
                const frame = frameDetails[frameData.frame]
                if (!frame) return null

                return (
                  <FrameItem
                    key={`${frameData.frame}-${frameData.timestamp}-${index}`}
                    frame={frame}
                    size={120}
                    overlayValue={frameData.timestamp}
                  />
                )
              })}
            </SelectedFramesGrid>
          </SelectedFramesContainer>
        )}

        {/* Edit Button and Info */}
        <EditButtonContainer>
          <EditButton
            disabled={!audioUrl || readOnly}
            onClick={onEditClick}
          >
            Edit Video
          </EditButton>

          {!audioUrl && (
            <EditButtonMessage>
              Please upload an audio file first to edit frames.
            </EditButtonMessage>
          )}
        </EditButtonContainer>
      </CollapsedRight>
    </StyledCollapsedView>
  )
}

export default CollapsedView