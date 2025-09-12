'use client'

import React, {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  useCallback,
  forwardRef,
} from 'react'
import type { KeyframeData } from './types'
import { getCurrentFrame, isVideoFile, getMediaUrl } from './utils'
import { SIZES } from './constants'
import { AudioPlayerContainer, AudioPreview, EmptyState } from './styled'

interface AudioPlayerProps {
  audioUrl: string | null
  frames: KeyframeData[]
  onTimeChange?: (time: number) => void
  onSeek?: (time: number) => void
  size?: 'small' | 'large'
  className?: string
  enableHotkeys?: boolean
  showPreview?: boolean
}

export interface AudioPlayerRef {
  pause: () => void
}

const AudioPlayer = forwardRef<AudioPlayerRef, AudioPlayerProps>(
  (
    {
      audioUrl,
      frames,
      onTimeChange,
      onSeek,
      size = 'large',
      className = '',
      enableHotkeys = false,
      showPreview = false,
    },
    ref,
  ) => {
    const audioRef = useRef<HTMLAudioElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const currentBlobRef = useRef<string | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isLoaded, setIsLoaded] = useState(false)
    const [audioBlob, setAudioBlob] = useState<string | null>(null)
    const [loadingBlob, setLoadingBlob] = useState(false)

    // Size configurations
    const config = {
      small: {
        preview: SIZES.SMALL_PREVIEW,
        fontSize: '0.75rem',
      },
      large: {
        preview: SIZES.LARGE_PREVIEW,
        fontSize: '0.875rem',
      },
    }[size]

    // Find current frame
    const currentFrame = getCurrentFrame(frames, currentTime)

    // Load audio as blob to enable proper seeking
    useEffect(() => {
      if (!audioUrl) {
        // Clean up previous blob URL if it exists
        if (currentBlobRef.current && currentBlobRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(currentBlobRef.current)
        }
        currentBlobRef.current = null
        setAudioBlob(null)
        setLoadingBlob(false)
        return
      }

      const loadAudioBlob = async () => {
        setLoadingBlob(true)
        try {
          const response = await fetch(audioUrl)
          if (!response.ok) throw new Error('Failed to load audio')

          const blob = await response.blob()
          const blobUrl = URL.createObjectURL(blob)

          // Clean up previous blob URL if it exists
          if (currentBlobRef.current && currentBlobRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(currentBlobRef.current)
          }

          currentBlobRef.current = blobUrl
          setAudioBlob(blobUrl)
        } catch (error) {
          console.warn('Failed to load audio as blob, using direct URL:', error)
          currentBlobRef.current = audioUrl
          setAudioBlob(audioUrl) // Fallback to direct URL
        } finally {
          setLoadingBlob(false)
        }
      }

      loadAudioBlob()
    }, [audioUrl])

    // Cleanup blob URL when component unmounts
    useEffect(() => {
      return () => {
        if (currentBlobRef.current && currentBlobRef.current.startsWith('blob:')) {
          URL.revokeObjectURL(currentBlobRef.current)
        }
      }
    }, [])

    // Expose pause function via ref
    useImperativeHandle(
      ref,
      () => ({
        pause: () => {
          if (audioRef.current && isPlaying) {
            audioRef.current.pause()
          }
        },
      }),
      [isPlaying],
    )

    // Audio event handlers
    const handleLoadedMetadata = () => {
      if (audioRef.current) {
        setDuration(audioRef.current.duration)
        setIsLoaded(true)
      }
    }

    const handleTimeUpdate = () => {
      if (audioRef.current) {
        const time = audioRef.current.currentTime
        setCurrentTime(time)
        onTimeChange?.(time)
      }
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

    // Seeking with retry mechanism
    const seekTo = useCallback(
      async (newTime: number) => {
        if (!audioRef.current || !duration) return

        const clampedTime = Math.max(0, Math.min(newTime, duration))

        try {
          // Wait for audio to be ready if needed
          if (audioRef.current.readyState < 2) {
            await new Promise<void>((resolve) => {
              const handleCanPlay = () => {
                audioRef.current?.removeEventListener('canplay', handleCanPlay)
                resolve()
              }
              audioRef.current?.addEventListener('canplay', handleCanPlay)
            })
          }

          audioRef.current.currentTime = clampedTime
          setCurrentTime(clampedTime)
          onSeek?.(clampedTime)
        } catch (error) {
          console.warn('Seek failed:', error)
        }
      },
      [duration, onSeek],
    )

    // Progress bar click handler
    const handleProgressClick = (e: React.MouseEvent) => {
      if (!progressRef.current || !duration) return

      const rect = progressRef.current.getBoundingClientRect()
      const percentage = (e.clientX - rect.left) / rect.width
      const newTime = percentage * duration
      seekTo(newTime)
    }

    // Frame marker click handler
    const handleMarkerClick = (timestamp: number) => {
      seekTo(timestamp)
    }

    // Toggle play/pause
    const togglePlayPause = useCallback(() => {
      if (!audioRef.current) return

      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
    }, [isPlaying])

    // Format time display
    const formatTime = (time: number) => {
      if (!isFinite(time)) return '0:00'
      const minutes = Math.floor(time / 60)
      const seconds = Math.floor(time % 60)
        .toString()
        .padStart(2, '0')
      return `${minutes}:${seconds}`
    }

    // Keyboard shortcuts
    useEffect(() => {
      if (size === 'small' || !enableHotkeys) return

      const handleKeyDown = (event: KeyboardEvent) => {
        if (!audioRef.current || !duration) return

        // Don't handle if user is typing in an input
        const target = event.target as Element
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

        switch (event.code) {
          case 'Space':
            event.preventDefault()
            togglePlayPause()
            break
          case 'ArrowLeft':
            event.preventDefault()
            seekTo(Math.max(0, currentTime - 5))
            break
          case 'ArrowRight':
            event.preventDefault()
            seekTo(Math.min(duration, currentTime + 5))
            break
        }
      }

      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }, [currentTime, duration, enableHotkeys, size, seekTo, togglePlayPause])

    if (!audioUrl) {
      return (
        <AudioPlayerContainer className={className} $width={config.preview}>
          <EmptyState $fontSize={config.fontSize}>No audio file uploaded</EmptyState>
        </AudioPlayerContainer>
      )
    }

    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

    return (
      <>
        <AudioPlayerContainer className={className} $width={config.preview}>
          {/* Preview Area */}
          {showPreview && (
            <AudioPreview $width={config.preview} $height={config.preview}>
              {currentFrame ? (
                isVideoFile(currentFrame.mimeType || undefined) ? (
                  <video
                    src={currentFrame.url || ''}
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
                    src={getMediaUrl(currentFrame, 'medium') || undefined}
                    alt={currentFrame.category}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                )
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    color: '#6c757d',
                    fontSize: config.fontSize,
                    padding: '1rem',
                  }}
                >
                  {frames.length === 0 ? 'No frames added' : 'Loading...'}
                </div>
              )}

              {/* Frame info overlay */}
              {currentFrame && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)',
                    padding: '0.5rem',
                    color: 'white',
                    fontSize: config.fontSize,
                  }}
                >
                  <div style={{ fontWeight: '500' }}>{currentFrame.category}</div>
                  {frames.length > 1 && (
                    <div style={{ fontSize: '0.625rem', opacity: 0.8 }}>
                      Frame {frames.findIndex((f) => f.id === currentFrame.id) + 1} of{' '}
                      {frames.length}
                    </div>
                  )}
                </div>
              )}
            </AudioPreview>
          )}

          {/* Audio Player Controls */}
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
            }}
          >
            <audio
              ref={audioRef}
              src={audioBlob || audioUrl}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={handleEnded}
              preload="metadata"
            />

            {/* Controls Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '0.75rem',
              }}
            >
              <button
                type="button"
                onClick={togglePlayPause}
                disabled={!isLoaded || loadingBlob}
                style={{
                  width: size === 'large' ? '48px' : '36px',
                  height: size === 'large' ? '48px' : '36px',
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  fontSize: size === 'large' ? '1.5rem' : '1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {loadingBlob ? '...' : isPlaying ? '⏸' : '▶'}
              </button>

              <div style={{ fontSize: config.fontSize, color: '#4b5563' }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>

            {/* Progress Bar */}
            <div
              ref={progressRef}
              onClick={handleProgressClick}
              style={{
                position: 'relative',
                height: size === 'large' ? '8px' : '6px',
                backgroundColor: '#e5e7eb',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {/* Progress Fill */}
              <div
                style={{
                  width: `${progressPercentage}%`,
                  height: '100%',
                  backgroundColor: '#3b82f6',
                  borderRadius: '4px',
                  transition: 'width 0.1s ease',
                }}
              />

              {/* Frame Markers */}
              {duration > 0 &&
                frames.map((frame, index) => (
                  <div
                    key={`${frame.id}-${frame.timestamp}-${index}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleMarkerClick(frame.timestamp)
                    }}
                    title={`Frame at ${frame.timestamp}s`}
                    style={{
                      position: 'absolute',
                      left: `${(frame.timestamp / duration) * 100}%`,
                      top: '-4px',
                      width: '3px',
                      height: '16px',
                      backgroundColor: '#f97316',
                      cursor: 'pointer',
                      transform: 'translateX(-50%)',
                      opacity: 0.85,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1'
                      e.currentTarget.style.transform = 'translateX(-50%) scale(1.2)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0.85'
                      e.currentTarget.style.transform = 'translateX(-50%) scale(1)'
                    }}
                  />
                ))}
            </div>
          </div>
        </AudioPlayerContainer>
      </>
    )
  },
)

AudioPlayer.displayName = 'AudioPlayer'

export default AudioPlayer
