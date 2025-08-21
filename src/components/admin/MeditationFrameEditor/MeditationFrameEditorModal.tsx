'use client'

import React, { useState, useEffect, useRef } from 'react'
import { FullscreenModal, useModal } from '@payloadcms/ui'
import AudioPreviewPlayer, { type AudioPreviewPlayerRef } from './AudioPreviewPlayer'
import FrameLibrary from './FrameLibrary'
import FrameManager from './FrameManager'
import FrameItem from './FrameItem'
import type { FrameData } from './types'
import type { Narrator, Frame } from '@/payload-types'

interface MeditationFrameEditorModalProps {
  initialFrames: FrameData[]
  audioUrl: string | null
  narrator: Narrator | null
  onSave: (frames: FrameData[]) => void
  readOnly?: boolean
}

const MODAL_SLUG = 'meditation-frame-editor'

const MeditationFrameEditorModal: React.FC<MeditationFrameEditorModalProps> = ({
  initialFrames,
  audioUrl,
  narrator,
  onSave,
  readOnly = false,
}) => {
  const { openModal, closeModal } = useModal()
  const [tempFrames, setTempFrames] = useState<FrameData[]>(initialFrames)
  const [currentTime, setCurrentTime] = useState(0)
  const [frameDetails, setFrameDetails] = useState<{ [key: string]: Frame }>({})
  const [isModalOpen, setIsModalOpen] = useState(false)
  const audioPlayerRef = useRef<AudioPreviewPlayerRef>(null)

  // Load frame details for thumbnail display
  useEffect(() => {
    const loadFrameDetails = async () => {
      const frameIds = initialFrames.map((f) => f.frame)
      const missingIds = frameIds.filter((id) => !frameDetails[id])

      if (missingIds.length === 0) return

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

        results.forEach((result) => {
          if (result) {
            newFrameDetails[result.id] = result.frame
          }
        })

        setFrameDetails(newFrameDetails)
      } catch (error) {
        console.error('Failed to load frame details:', error)
      }
    }

    loadFrameDetails()
  }, [initialFrames, frameDetails])

  const pauseAllAudio = () => {
    // Pause all audio elements on the page
    const audioElements = document.querySelectorAll('audio')
    audioElements.forEach((audio) => {
      if (!audio.paused) {
        audio.pause()
      }
    })

    // Also pause any video elements that might be playing
    const videoElements = document.querySelectorAll('video')
    videoElements.forEach((video) => {
      if (!video.paused) {
        video.pause()
      }
    })
  }

  const handleOpenModal = () => {
    // Pause all currently playing audio on the page
    pauseAllAudio()

    // Reset temp state to current saved state when opening
    setTempFrames([...initialFrames])
    setCurrentTime(0)
    setIsModalOpen(true)
    openModal(MODAL_SLUG)
  }

  const handleSave = () => {
    // Pause all audio on the page when closing modal
    pauseAllAudio()
    setIsModalOpen(false)
    onSave([...tempFrames])
    closeModal(MODAL_SLUG)
  }

  const handleCancel = () => {
    // Pause all audio on the page when closing modal
    pauseAllAudio()
    setIsModalOpen(false)
    // Reset temp state and close without saving
    setTempFrames([...initialFrames])
    closeModal(MODAL_SLUG)
  }

  const handleFramesChange = (newFrames: FrameData[]) => {
    setTempFrames(newFrames)
  }

  const handleTimeChange = (time: number) => {
    setCurrentTime(time)
  }

  const handleFrameSelect = (frame: Frame) => {
    // Round timestamp to nearest second
    const roundedTime = Math.round(currentTime)

    const newFrameData: FrameData = {
      frame: frame.id,
      timestamp: roundedTime,
    }

    // Apply first frame rule: if this is the first frame, set timestamp to 0
    if (tempFrames.length === 0) {
      newFrameData.timestamp = 0
    }

    // Check for existing frame at this timestamp and replace it
    const existingFrameIndex = tempFrames.findIndex((f) => f.timestamp === newFrameData.timestamp)

    let newFrames: FrameData[]
    if (existingFrameIndex !== -1) {
      // Replace existing frame at this timestamp
      newFrames = [...tempFrames]
      newFrames[existingFrameIndex] = newFrameData
    } else {
      // Add new frame
      newFrames = [...tempFrames, newFrameData]
    }

    handleFramesChange(newFrames)
  }

  return (
    <>
      {/* Collapsed State */}
      <div
        className="meditation-frame-editor-collapsed"
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'flex-start',
          padding: '1rem',
          border: '1px solid var(--theme-border-color)',
          borderRadius: 'var(--style-radius-l)',
          backgroundColor: 'var(--theme-elevation-50)',
        }}
      >
        {/* Unified Audio Preview Player */}
        <AudioPreviewPlayer
          ref={audioPlayerRef}
          audioUrl={audioUrl}
          frames={initialFrames}
          size="small"
          enableHotkeys={false}
        />

        {/* Right Side - Selected Frames and Edit Button */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            minWidth: 0, // Allow shrinking
          }}
        >
          {/* Selected Frames Thumbnail Grid */}
          {initialFrames.length > 0 && (
            <div
              style={{
                padding: '0.75rem',
                backgroundColor: 'var(--theme-bg)',
                border: '1px solid var(--theme-border-color)',
                borderRadius: 'var(--style-radius-m)',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: 'var(--theme-text)',
                  marginBottom: '0.5rem',
                }}
              >
                Selected Frames ({initialFrames.length})
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  paddingBottom: '4px',
                }}
              >
                {[...initialFrames]
                  .sort((a, b) => a.timestamp - b.timestamp)
                  .map((frameData, index) => {
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
              </div>
            </div>
          )}

          {/* Edit Button and Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleOpenModal}
              disabled={!audioUrl || readOnly}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: !audioUrl || readOnly ? 'var(--theme-elevation-200)' : 'var(--theme-success-400)',
                color: !audioUrl || readOnly ? 'var(--theme-elevation-600)' : 'white',
                border: 'none',
                borderRadius: 'var(--style-radius-m)',
                cursor: !audioUrl || readOnly ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                width: '100%',
              }}
            >
              Edit Video
            </button>

            {!audioUrl && (
              <div style={{ fontSize: '0.75rem', color: 'var(--theme-elevation-600)' }}>
                Please upload an audio file first to edit frames.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      <FullscreenModal slug={MODAL_SLUG} className="meditation-frame-editor-modal">
        {/* Modal Header */}
        <div
          style={{
            padding: '1.5rem 1.5rem 1rem 1.5rem',
            borderBottom: '1px solid var(--theme-border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--theme-bg)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600', color: 'var(--theme-text)' }}>
            Create Meditation Video
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--theme-elevation-300)',
                color: 'var(--theme-text)',
                border: 'none',
                borderRadius: 'var(--style-radius-m)',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--theme-success-400)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--style-radius-m)',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Save
            </button>
          </div>
        </div>

        {/* Mobile Warning - Show on small screens */}
        <div
          style={{
            display: 'block',
            padding: '2rem',
            textAlign: 'center',
            backgroundColor: 'var(--theme-warning-50)',
            border: '1px solid var(--theme-warning-300)',
            borderRadius: 'var(--style-radius-l)',
            margin: '1.5rem',
            color: 'var(--theme-warning-950)',
          }}
          className="mobile-warning"
        >
          <div style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
            📱 Screen Too Small
          </div>
          <div style={{ fontSize: '0.875rem' }}>
            The Meditation Frame Editor requires a larger screen (tablet or desktop) for optimal
            use. Please use a device with a wider display to access this feature.
          </div>
        </div>

        {/* Modal Content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: '1.5rem',
            padding: '1.5rem',
            overflow: 'hidden',
            backgroundColor: 'var(--theme-bg)',
            height: 'calc(100vh - 120px)',
            minHeight: '600px', // Ensure minimum viable height
          }}
          className="modal-content"
        >
          {/* Left Column - Audio Preview */}
          <div
            style={{
              flex: '0 0 350px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              overflow: 'hidden',
              height: '100%',
            }}
          >
            {/* Unified Audio Preview Player */}
            <AudioPreviewPlayer
              audioUrl={audioUrl}
              frames={tempFrames}
              onTimeChange={handleTimeChange}
              onSeek={(time) => setCurrentTime(time)}
              size="large"
              enableHotkeys={isModalOpen}
            />

            {/* Instructions */}
            {narrator && (
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--theme-elevation-600)',
                  textAlign: 'center',
                  padding: '1rem',
                  backgroundColor: 'var(--theme-elevation-50)',
                  borderRadius: 'var(--style-radius-m)',
                  border: '1px solid var(--theme-border-color)',
                  width: '320px',
                  flexShrink: 0,
                }}
              >
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--theme-text)' }}>
                  📍 Quick Instructions
                </div>
                Click any frame to add it at the current audio time ({Math.round(currentTime)}s)
                {tempFrames.length === 0 && (
                  <>
                    <br />
                    <span style={{ fontWeight: '500', color: 'var(--theme-success-400)' }}>
                      Your first frame will be set to 0 seconds
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Frame Count Summary */}
            {tempFrames.length > 0 && (
              <div
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--theme-text)',
                  textAlign: 'center',
                  padding: '0.75rem',
                  backgroundColor: 'var(--theme-success-50)',
                  borderRadius: 'var(--style-radius-m)',
                  border: '1px solid var(--theme-success-300)',
                  width: '320px',
                  flexShrink: 0,
                }}
              >
                <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: 'var(--theme-success-700)' }}>
                  📊 Progress
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--theme-success-700)' }}>
                  {tempFrames.length} frame{tempFrames.length !== 1 ? 's' : ''} added
                </div>
                <div style={{ fontSize: '0.625rem', color: 'var(--theme-success-600)', marginTop: '0.25rem' }}>
                  Longest: {Math.max(...tempFrames.map((f) => f.timestamp))}s
                </div>
              </div>
            )}

            {/* Spacer to push content to top */}
            <div style={{ flex: 1 }} />
          </div>

          {/* Middle Column - Frame Library */}
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
          >
            <FrameLibrary
              narrator={narrator}
              onFrameSelect={handleFrameSelect}
              disabled={readOnly}
            />
          </div>

          {/* Right Column - Current Frames */}
          <div
            style={{
              flex: '0 0 280px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              height: '100%',
            }}
          >
            <FrameManager
              frames={tempFrames}
              onFramesChange={handleFramesChange}
              readOnly={readOnly}
            />
          </div>
        </div>
      </FullscreenModal>

      {/* CSS for responsive mobile handling */}
      <style jsx>{`
        @media (max-width: 1024px) {
          .mobile-warning {
            display: block !important;
          }
          .modal-content {
            display: none !important;
          }
        }

        @media (min-width: 1025px) {
          .mobile-warning {
            display: none !important;
          }
          .modal-content {
            display: flex !important;
          }
        }
      `}</style>
    </>
  )
}

export default MeditationFrameEditorModal
