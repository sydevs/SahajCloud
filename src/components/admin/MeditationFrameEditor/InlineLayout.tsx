'use client'

import React, { useState, useRef, useCallback } from 'react'
import AudioPlayer, { type AudioPlayerRef } from './AudioPlayer'
import FrameLibrary from './FrameLibrary'
import FrameManager from './FrameManager'
import type { KeyframeData } from './types'
import type { Narrator, Frame } from '@/payload-types'
import { roundToNearestSecond } from './utils'
import {
  InlineContent,
  LeftColumn,
  RightColumn,
  AudioPlayerSection,
  FrameManagerSection,
} from './styled'

interface InlineLayoutProps {
  audioUrl: string | null
  narrator: Narrator | null
  frames: KeyframeData[]
  onFramesChange: (frames: KeyframeData[]) => void
  readOnly?: boolean
}

const InlineLayout: React.FC<InlineLayoutProps> = ({
  audioUrl,
  narrator,
  frames,
  onFramesChange,
  readOnly = false,
}) => {
  const [currentTime, setCurrentTime] = useState(0)
  const audioPlayerRef = useRef<AudioPlayerRef>(null)

  const handleTimeChange = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  const handleSeekToFrame = useCallback((timestamp: number) => {
    audioPlayerRef.current?.seek(timestamp)
  }, [])

  const handleFrameSelect = useCallback(
    (frame: Frame) => {
      const roundedTime = roundToNearestSecond(currentTime)

      const newKeyframeData: KeyframeData = {
        ...frame,
        id: frame.id,
        timestamp: frames.length === 0 ? 0 : roundedTime,
      }

      // Check for existing frame at this timestamp and replace it
      const existingFrameIndex = frames.findIndex((f) => f.timestamp === newKeyframeData.timestamp)

      const newFrames: KeyframeData[] =
        existingFrameIndex !== -1
          ? frames.map((f, index) => (index === existingFrameIndex ? newKeyframeData : f))
          : [...frames, newKeyframeData]

      onFramesChange(newFrames)
    },
    [currentTime, frames, onFramesChange],
  )

  return (
    <InlineContent>
      {/* Left Column - Audio Player and Frame Manager */}
      <LeftColumn>
        <AudioPlayerSection>
          <AudioPlayer
            ref={audioPlayerRef}
            audioUrl={audioUrl}
            frames={frames}
            onTimeChange={handleTimeChange}
            onSeek={setCurrentTime}
            size="small"
            showPreview={true}
          />
        </AudioPlayerSection>

        <FrameManagerSection>
          <FrameManager
            frames={frames}
            onFramesChange={onFramesChange}
            readOnly={readOnly}
            currentTime={currentTime}
            onSeekToFrame={handleSeekToFrame}
          />
        </FrameManagerSection>
      </LeftColumn>

      {/* Right Column - Frame Library */}
      <RightColumn>
        <FrameLibrary
          narrator={narrator}
          onFrameSelect={handleFrameSelect}
          disabled={readOnly}
          currentTime={currentTime}
          frames={frames}
        />
      </RightColumn>
    </InlineContent>
  )
}

export default InlineLayout
