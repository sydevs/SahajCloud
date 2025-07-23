'use client'

import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import type { FrameData } from './types'
import type { Frame } from '@/payload-types'

interface AudioPreviewPlayerProps {
  audioUrl: string | null
  frames: FrameData[]
  onTimeChange?: (time: number) => void
  onSeek?: (time: number) => void
  size?: 'small' | 'large'
  className?: string
  _onPause?: () => void
}

export interface AudioPreviewPlayerRef {
  pause: () => void
}

const AudioPreviewPlayer = forwardRef<AudioPreviewPlayerRef, AudioPreviewPlayerProps>(({
  audioUrl,
  frames,
  onTimeChange,
  onSeek,
  size = 'large',
  className = '',
  _onPause,
}, ref) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [frameDetails, setFrameDetails] = useState<{ [key: string]: Frame }>({})
  const [currentFrame, setCurrentFrame] = useState<Frame | null>(null)
  const [isSeeking, setIsSeeking] = useState(false)

  // Size configurations
  const sizeConfig = {
    small: {
      preview: 200,
      controlHeight: 80,
      fontSize: '0.75rem',
      buttonSize: '2rem',
      progressHeight: '4px',
    },
    large: {
      preview: 320,
      controlHeight: 110,
      fontSize: '0.875rem',
      buttonSize: '2.75rem',
      progressHeight: '8px',
    },
  }

  const config = sizeConfig[size]

  // Load frame details
  useEffect(() => {
    const loadFrameDetails = async () => {
      const frameIds = frames.map(f => f.frame)
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
  }, [frames, frameDetails])

  // Update current frame based on time
  useEffect(() => {
    if (frames.length === 0) {
      setCurrentFrame(null)
      return
    }

    const sortedFrames = [...frames].sort((a, b) => a.timestamp - b.timestamp)
    let activeFrame = sortedFrames[0]
    
    for (const frame of sortedFrames) {
      if (frame.timestamp <= currentTime) {
        activeFrame = frame
      } else {
        break
      }
    }

    const frameDetail = frameDetails[activeFrame.frame]
    if (frameDetail) {
      setCurrentFrame(frameDetail)
    }
  }, [currentTime, frames, frameDetails])

  const togglePlayPause = useCallback(() => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
  }, [isPlaying])

  // Expose pause function via ref
  useImperativeHandle(ref, () => ({
    pause: () => {
      if (audioRef.current && isPlaying) {
        audioRef.current.pause()
      }
    }
  }), [isPlaying])

  // Keyboard navigation (only for large size)
  useEffect(() => {
    // Disable keyboard shortcuts for collapsed/small view
    if (size === 'small') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!audioRef.current || !duration) return

      // Only handle keyboard events if the component is focused or no input is focused
      const activeElement = document.activeElement
      const isInputFocused = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA'
      
      if (isInputFocused) return

      switch (event.code) {
        case 'Space':
          event.preventDefault()
          togglePlayPause()
          break
        case 'ArrowLeft':
          event.preventDefault()
          // Seek backward 5 seconds
          audioRef.current.currentTime = Math.max(0, currentTime - 5)
          break
        case 'ArrowRight':
          event.preventDefault()
          // Seek forward 5 seconds
          audioRef.current.currentTime = Math.min(duration, currentTime + 5)
          break
        case 'ArrowUp':
          event.preventDefault()
          // Seek backward 10 seconds
          audioRef.current.currentTime = Math.max(0, currentTime - 10)
          break
        case 'ArrowDown':
          event.preventDefault()
          // Seek forward 10 seconds
          audioRef.current.currentTime = Math.min(duration, currentTime + 10)
          break
        case 'Home':
          event.preventDefault()
          // Go to beginning
          audioRef.current.currentTime = 0
          break
        case 'End':
          event.preventDefault()
          // Go to end
          audioRef.current.currentTime = duration
          break
      }
    }

    // Add event listener
    document.addEventListener('keydown', handleKeyDown)

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [currentTime, duration, togglePlayPause, size])

  // Audio event handlers
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current && !isSeeking) {
      const time = audioRef.current.currentTime
      setCurrentTime(time)
      onTimeChange?.(time)
    }
  }

  const handlePlay = () => setIsPlaying(true)
  const handlePause = () => setIsPlaying(false)
  const handleEnded = () => setIsPlaying(false)

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const newTime = percentage * duration
    
    audioRef.current.currentTime = newTime
    setCurrentTime(newTime)
    onSeek?.(newTime)
  }

  const handleProgressMouseDown = () => {
    setIsSeeking(true)
  }

  const handleProgressMouseUp = () => {
    setIsSeeking(false)
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getProgressPercentage = (): number => {
    if (!duration) return 0
    return (currentTime / duration) * 100
  }


  return <>
    <div className={`audio-preview-player ${className}`} style={{
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      overflow: 'hidden',
      width: config.preview + 'px',
      border: '1px solid #e0e0e0',
    }}>
      {/* Square Preview Area */}
      <div style={{
        width: config.preview + 'px',
        height: config.preview + 'px',
        backgroundColor: '#f0f0f0',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {currentFrame ? (
          currentFrame.mimeType?.startsWith('video/') ? (
            <video
              src={currentFrame.url || undefined}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              loop
              muted
              autoPlay
              playsInline
            />
          ) : (
            <img
              src={currentFrame.url || undefined}
              alt={currentFrame.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          )
        ) : (
          <div style={{
            textAlign: 'center',
            color: '#6c757d',
            fontSize: config.fontSize,
            padding: '1rem',
          }}>
            {frames.length === 0 ? 'No frames added' : 'Loading...'}
          </div>
        )}

        {/* Frame info overlay */}
        {currentFrame && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
            padding: '0.5rem',
            color: 'white',
            fontSize: config.fontSize,
          }}>
            <div style={{ fontWeight: '500' }}>{currentFrame.name}</div>
            {frames.length > 1 && (
              <div style={{ fontSize: '0.625rem', opacity: 0.8 }}>
                Frame {frames.findIndex(f => frameDetails[f.frame]?.id === currentFrame.id) + 1} of {frames.length}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audio Controls */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '0.75rem',
        height: config.controlHeight + 'px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '0.5rem',
        borderTop: '1px solid #e0e0e0',
      }}>
        {audioUrl ? (
          <>
            {/* Hidden audio element */}
            <audio
              ref={audioRef}
              src={audioUrl}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={handleEnded}
            />

            {/* Play/Pause button and time */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}>
              <button
                type="button"
                onClick={togglePlayPause}
                style={{
                  width: config.buttonSize,
                  height: config.buttonSize,
                  borderRadius: '50%',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: size === 'small' ? '0.875rem' : '1rem',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0056b3'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#007bff'}
              >
                {isPlaying ? '❚❚' : '▶'}
              </button>

              <div style={{
                color: '#495057',
                fontSize: config.fontSize,
                fontFamily: 'monospace',
              }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            {/* Progress bar with frame markers */}
            <div 
              style={{
                position: 'relative',
                width: '100%',
                height: config.progressHeight,
                backgroundColor: '#e9ecef',
                borderRadius: '3px',
                cursor: 'pointer',
                overflow: 'visible',
              }}
              onClick={handleProgressClick}
              onMouseDown={handleProgressMouseDown}
              onMouseUp={handleProgressMouseUp}
            >
              {/* Progress fill */}
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                height: '100%',
                width: `${getProgressPercentage()}%`,
                backgroundColor: '#007bff',
                borderRadius: '3px',
                transition: isSeeking ? 'none' : 'width 0.1s',
              }} />

              {/* Frame markers */}
              {duration > 0 && frames.map((frame, index) => (
                <div
                  key={`${frame.frame}-${frame.timestamp}-${index}`}
                  style={{
                    position: 'absolute',
                    left: `${(frame.timestamp / duration) * 100}%`,
                    top: '-6px',
                    width: '3px',
                    height: `calc(100% + 12px)`,
                    backgroundColor: '#f97316',
                    opacity: 0.85,
                    pointerEvents: 'none',
                  }}
                  title={`Frame at ${frame.timestamp}s`}
                />
              ))}

              {/* Playhead */}
              <div style={{
                position: 'absolute',
                left: `${getProgressPercentage()}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: size === 'small' ? '12px' : '14px',
                height: size === 'small' ? '12px' : '14px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                border: '2px solid #007bff',
                pointerEvents: 'none',
                transition: isSeeking ? 'none' : 'left 0.1s',
              }} />
            </div>
          </>
        ) : (
          <div style={{
            textAlign: 'center',
            color: '#6c757d',
            fontSize: config.fontSize,
          }}>
            No audio file uploaded
          </div>
        )}
      </div>
    </div>
      
    {/* Keyboard shortcuts help - outside the frame */}
    {size === 'large' && audioUrl && (
      <div style={{
        fontSize: '0.75rem',
        color: '#6b7280',
        textAlign: 'center',
        marginTop: '0.5rem',
        padding: '0.5rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '4px',
        border: '1px solid #e5e7eb',
        lineHeight: 1.3,
        fontWeight: '500',
        width: '320px'
      }}>
        <strong>Keyboard Shortcuts:</strong><br />Space: Play/Pause • ←→: ±5s • ↑↓: ±10s • Home/End: Start/End
      </div>
    )}
  </>
})

AudioPreviewPlayer.displayName = 'AudioPreviewPlayer'

export default AudioPreviewPlayer