'use client'

import React, { useState, useRef, useCallback } from 'react'
import { FullscreenModal, useModal } from '@payloadcms/ui'
import AudioPlayer, { type AudioPlayerRef } from './AudioPlayer'
import FrameLibrary from './FrameLibrary'
import FrameManager from './FrameManager'
import ModalHeader from './components/ModalHeader'
import CollapsedView from './components/CollapsedView'
import InstructionsPanel from './components/InstructionsPanel'
import type { KeyframeData } from './types'
import type { Narrator, Frame } from '@/payload-types'
import { pauseAllMedia, roundToNearestSecond, sortFramesByTimestamp } from './utils'
import { MODAL_CONFIG } from './constants'
import {
  MobileWarning,
  MobileWarningTitle,
  MobileWarningText,
  ModalContent,
  LeftColumn,
  MiddleColumn,
  RightColumn,
} from './styled'

interface MeditationFrameEditorModalProps {
  initialFrames: KeyframeData[]
  audioUrl: string | null
  narrator: Narrator | null
  onSave: (frames: KeyframeData[]) => void
  readOnly?: boolean
}

const MeditationFrameEditorModal: React.FC<MeditationFrameEditorModalProps> = ({
  initialFrames,
  audioUrl,
  narrator,
  onSave,
  readOnly = false,
}) => {
  const { openModal, closeModal } = useModal()
  const [tempFrames, setTempFrames] = useState<KeyframeData[]>(initialFrames)
  const [currentTime, setCurrentTime] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const audioPlayerRef = useRef<AudioPlayerRef>(null)

  const handleOpenModal = useCallback(() => {
    pauseAllMedia()
    setTempFrames([...initialFrames])
    setCurrentTime(0)
    setIsModalOpen(true)
    openModal(MODAL_CONFIG.SLUG)
  }, [initialFrames, openModal])

  const handleSave = useCallback(() => {
    pauseAllMedia()
    setIsModalOpen(false)
    onSave(sortFramesByTimestamp(tempFrames))
    closeModal(MODAL_CONFIG.SLUG)
  }, [tempFrames, onSave, closeModal])

  const handleCancel = useCallback(() => {
    pauseAllMedia()
    setIsModalOpen(false)
    setTempFrames([...initialFrames])
    closeModal(MODAL_CONFIG.SLUG)
  }, [initialFrames, closeModal])

  const handleFramesChange = useCallback((newFrames: KeyframeData[]) => {
    setTempFrames(newFrames)
  }, [])

  const handleTimeChange = useCallback((time: number) => {
    setCurrentTime(time)
  }, [])

  const handleFrameSelect = useCallback(
    (frame: Frame) => {
      const roundedTime = roundToNearestSecond(currentTime)

      const newKeyframeData: KeyframeData = {
        id: frame.id,
        timestamp: tempFrames.length === 0 ? 0 : roundedTime,
      }

      // Check for existing frame at this timestamp and replace it
      const existingFrameIndex = tempFrames.findIndex(
        (f) => f.timestamp === newKeyframeData.timestamp,
      )

      const newFrames: KeyframeData[] =
        existingFrameIndex !== -1
          ? tempFrames.map((f, index) => (index === existingFrameIndex ? newKeyframeData : f))
          : [...tempFrames, newKeyframeData]

      handleFramesChange(newFrames)
    },
    [currentTime, tempFrames, handleFramesChange],
  )

  return (
    <>
      {/* Collapsed State */}
      <CollapsedView
        frames={initialFrames}
        audioUrl={audioUrl}
        onEditClick={handleOpenModal}
        readOnly={readOnly}
      />

      {/* Modal */}
      <FullscreenModal slug={MODAL_CONFIG.SLUG} className="meditation-frame-editor-modal">
        <ModalHeader onSave={handleSave} onCancel={handleCancel} />

        {/* Mobile Warning */}
        <MobileWarning>
          <MobileWarningTitle>📱 Screen Too Small</MobileWarningTitle>
          <MobileWarningText>
            The Meditation Frame Editor requires a larger screen (tablet or desktop) for optimal
            use. Please use a device with a wider display to access this feature.
          </MobileWarningText>
        </MobileWarning>

        {/* Modal Content */}
        <ModalContent>
          {/* Left Column - Audio Preview */}
          <LeftColumn>
            <AudioPlayer
              ref={audioPlayerRef}
              audioUrl={audioUrl}
              frames={tempFrames}
              onTimeChange={handleTimeChange}
              onSeek={setCurrentTime}
              size="large"
              enableHotkeys={isModalOpen}
              showPreview={true}
            />

            <InstructionsPanel narrator={narrator} currentTime={currentTime} frames={tempFrames} />

            {/* Spacer */}
            <div style={{ flex: 1 }} />
          </LeftColumn>

          {/* Middle Column - Frame Library */}
          <MiddleColumn>
            <FrameLibrary
              narrator={narrator}
              onFrameSelect={handleFrameSelect}
              disabled={readOnly}
            />
          </MiddleColumn>

          {/* Right Column - Current Frames */}
          <RightColumn>
            <FrameManager
              frames={tempFrames}
              onFramesChange={handleFramesChange}
              readOnly={readOnly}
            />
          </RightColumn>
        </ModalContent>
      </FullscreenModal>
    </>
  )
}

export default MeditationFrameEditorModal
