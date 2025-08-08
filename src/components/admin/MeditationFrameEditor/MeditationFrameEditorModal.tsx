'use client'

import React, { useState, useEffect, useRef } from 'react'
import { FullscreenModal, useModal } from '@payloadcms/ui'
import AudioPreviewPlayer, { type AudioPreviewPlayerRef } from './AudioPreviewPlayer'
import FrameLibrary from './FrameLibrary'
import FrameManager from './FrameManager'
import type { FrameData } from './types'
import type { Narrator, Frame } from '@/payload-types'
import Image from 'next/image'

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
  const audioPlayerRef = useRef<AudioPreviewPlayerRef>(null)

  // Load frame details for thumbnail display
  useEffect(() => {
    const loadFrameDetails = async () => {
      const frameIds = initialFrames.map(f => f.frame)
      const missingIds = frameIds.filter(id => !frameDetails[id])
      
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
        
        results.forEach(result => {
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

  const handleOpenModal = () => {
    // Reset temp state to current saved state when opening
    setTempFrames([...initialFrames])
    setCurrentTime(0)
    openModal(MODAL_SLUG)
  }

  const handleSave = () => {
    // Pause audio in collapsed view
    audioPlayerRef.current?.pause()
    onSave([...tempFrames])
    closeModal(MODAL_SLUG)
  }

  const handleCancel = () => {
    // Pause audio in collapsed view
    audioPlayerRef.current?.pause()
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
    const existingFrameIndex = tempFrames.findIndex(f => f.timestamp === newFrameData.timestamp)
    
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
      <div className="meditation-frame-editor-collapsed" style={{ 
        display: 'flex', 
        gap: '1rem', 
        alignItems: 'flex-start',
        padding: '1rem',
        border: '1px solid #e0e0e0', 
        borderRadius: '8px', 
        backgroundColor: '#fafafa' 
      }}>
        {/* Unified Audio Preview Player */}
        <AudioPreviewPlayer
          ref={audioPlayerRef}
          audioUrl={audioUrl}
          frames={initialFrames}
          size="small"
        />

        {/* Right Side - Selected Frames and Edit Button */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '0.75rem',
          minWidth: 0 // Allow shrinking
        }}>
          {/* Selected Frames Thumbnail Grid */}
          {initialFrames.length > 0 && (
            <div style={{ 
              padding: '0.75rem',
              backgroundColor: '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
            }}>
              <div style={{ 
                fontSize: '0.75rem', 
                fontWeight: '600', 
                color: '#374151', 
                marginBottom: '0.5rem' 
              }}>
                Selected Frames ({initialFrames.length})
              </div>
              <div style={{
                display: 'flex',
                gap: '8px',
                height: '140px',
                overflowX: 'auto',
                overflowY: 'hidden',
                paddingBottom: '4px'
              }}>
                {[...initialFrames]
                  .sort((a, b) => a.timestamp - b.timestamp)
                  .map((frameData, index) => {
                    const frame = frameDetails[frameData.frame]
                    return (
                      <div key={`${frameData.frame}-${frameData.timestamp}-${index}`} style={{
                        position: 'relative',
                        width: '120px',
                        height: '140px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        border: '1px solid #d1d5db',
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        {/* Image/Video container - Square */}
                        <div style={{
                          width: '100%',
                          height: '120px',
                          position: 'relative',
                          backgroundColor: '#f9fafb'
                        }}>
                          {frame?.url ? (
                            frame.mimeType?.startsWith('video/') ? (
                              <video
                                src={frame.url}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                muted
                              />
                            ) : (
                              <Image
                                src={frame.url}
                                alt={frame.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                width={frame.width || undefined}
                                height={frame.height || undefined}
                              />
                            )
                          ) : (
                            <div style={{
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.5rem',
                              color: '#6b7280'
                            }}>
                              ...
                            </div>
                          )}
                          {/* Timestamp overlay */}
                          <div style={{
                            position: 'absolute',
                            bottom: '4px',
                            right: '4px',
                            backgroundColor: 'rgba(0,0,0,0.85)',
                            color: 'white',
                            fontSize: '0.875rem',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            lineHeight: 1,
                            fontWeight: '600'
                          }}>
                            {frameData.timestamp}s
                          </div>
                        </div>
                        
                        {/* Frame name */}
                        <div style={{
                          padding: '2px 4px',
                          fontSize: '0.6rem',
                          color: '#374151',
                          lineHeight: 1.1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          height: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center'
                        }}>
                          {frame?.name || `Frame ${frameData.frame}`}
                        </div>
                      </div>
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
                backgroundColor: !audioUrl || readOnly ? '#ccc' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: !audioUrl || readOnly ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                width: '100%',
              }}
            >
              Edit Video
            </button>
            
            {!audioUrl && (
              <div style={{ fontSize: '0.75rem', color: '#666' }}>
                Please upload an audio file first to edit frames.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      <FullscreenModal slug={MODAL_SLUG} className="meditation-frame-editor-modal">
        {/* Modal Header */}
        <div style={{ 
          padding: '1.5rem 1.5rem 1rem 1.5rem', 
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#fff'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '600' }}>
            Create Meditation Video
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
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
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Save
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          gap: '1.5rem', 
          padding: '1.5rem',
          overflow: 'hidden',
          backgroundColor: '#fff',
          height: 'calc(100vh - 120px)'
        }}>
          {/* Left Column - Audio Preview */}
          <div style={{ 
            flex: '0 0 350px', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '1.5rem',
            overflow: 'hidden'
          }}>
            {/* Unified Audio Preview Player */}
            <AudioPreviewPlayer
              audioUrl={audioUrl}
              frames={tempFrames}
              onTimeChange={handleTimeChange}
              onSeek={(time) => setCurrentTime(time)}
              size="large"
            />
            
            {/* Instructions */}
            {narrator && (
              <div style={{ 
                fontSize: '0.75rem', 
                color: '#6b7280', 
                textAlign: 'center',
                padding: '0.75rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                width: '320px'
              }}>
                Click any frame to add it at the current audio time ({Math.round(currentTime)}s)
                {tempFrames.length === 0 && <><br />Your first frame will be set to 0 seconds</>}
              </div>
            )}
          </div>

          {/* Middle Column - Frame Library */}
          <div style={{ 
            flex: 1, 
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <FrameLibrary
                narrator={narrator}
                onFrameSelect={handleFrameSelect}
                disabled={readOnly}
              />
            </div>
          </div>

          {/* Right Column - Current Frames */}
          <div style={{ 
            flex: '0 0 280px', 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <FrameManager
              frames={tempFrames}
              onFramesChange={handleFramesChange}
              readOnly={readOnly}
            />
          </div>
        </div>
      </FullscreenModal>
    </>
  )
}

export default MeditationFrameEditorModal