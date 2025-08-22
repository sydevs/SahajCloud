'use client'

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react'
import type { FrameData } from './types'
import { useFrameDetails } from './hooks/useFrameDetails'
import { formatTime, getCurrentFrame, getProgressPercentage, clampValue, isVideoFile, getMediaUrl, isInputElement } from './utils'
import { SIZES, KEYBOARD_SHORTCUTS, LIMITS } from './constants'
import { 
  AudioPlayerContainer,
  AudioPreview,
  AudioControls,
  AudioControlsRow,
  PlayButton,
  TimeDisplay,
  ProgressBar,
  ProgressFill,
  FrameMarker,
  ProgressPlayhead,
  KeyboardShortcuts,
  EmptyState
} from './styled'

interface AudioPlayerProps {
  audioUrl: string | null
  frames: FrameData[]
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
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isLoaded, setIsLoaded] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isSeeking, setIsSeeking] = useState(false)

    const frameIds = frames.map(f => f.frame)
    const { frameDetails } = useFrameDetails(frameIds)

    // Size configurations
    const config = {
      small: {
        preview: SIZES.SMALL_PREVIEW,
        fontSize: '0.75rem',
        buttonSize: SIZES.BUTTON_SMALL,
        progressHeight: SIZES.PROGRESS_HEIGHT_SMALL,
      },
      large: {
        preview: SIZES.LARGE_PREVIEW,
        fontSize: '0.875rem',
        buttonSize: SIZES.BUTTON_LARGE,
        progressHeight: SIZES.PROGRESS_HEIGHT_LARGE,
      },
    }[size]

    // Find current frame
    const currentFrame = getCurrentFrame(frames, currentTime)
    const currentFrameDetails = currentFrame ? frameDetails[currentFrame.frame] : null

    const togglePlayPause = useCallback(() => {
      if (!audioRef.current) return

      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
    }, [isPlaying])

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

    // Keyboard navigation
    useEffect(() => {
      if (size === 'small' || !enableHotkeys) return

      const handleKeyDown = (event: KeyboardEvent) => {
        if (!audioRef.current || !duration) return

        const activeElement = document.activeElement
        if (activeElement && isInputElement(activeElement)) return

        switch (event.code) {
          case KEYBOARD_SHORTCUTS.SPACE:
            event.preventDefault()
            togglePlayPause()
            break
          case KEYBOARD_SHORTCUTS.ARROW_LEFT:
            event.preventDefault()
            audioRef.current.currentTime = Math.max(0, currentTime - LIMITS.SEEK_STEP_SMALL)
            break
          case KEYBOARD_SHORTCUTS.ARROW_RIGHT:
            event.preventDefault()
            audioRef.current.currentTime = Math.min(duration, currentTime + LIMITS.SEEK_STEP_SMALL)
            break
          case KEYBOARD_SHORTCUTS.ARROW_UP:
            event.preventDefault()
            audioRef.current.currentTime = Math.max(0, currentTime - LIMITS.SEEK_STEP_LARGE)
            break
          case KEYBOARD_SHORTCUTS.ARROW_DOWN:
            event.preventDefault()
            audioRef.current.currentTime = Math.min(duration, currentTime + LIMITS.SEEK_STEP_LARGE)
            break
          case KEYBOARD_SHORTCUTS.HOME:
            event.preventDefault()
            audioRef.current.currentTime = 0
            break
          case KEYBOARD_SHORTCUTS.END:
            event.preventDefault()
            audioRef.current.currentTime = duration
            break
        }
      }

      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }, [currentTime, duration, togglePlayPause, size, enableHotkeys])

    // Audio event handlers
    const handleLoadStart = () => {
      setIsLoading(true)
      setIsLoaded(false)
    }

    const handleLoadedMetadata = () => {
      if (audioRef.current) {
        setDuration(audioRef.current.duration)
        setIsLoaded(true)
        setIsLoading(false)
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
    
    const handleError = () => {
      setIsLoading(false)
      setIsLoaded(false)
    }

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!audioRef.current || !duration) return

      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const percentage = x / rect.width
      const newTime = percentage * duration
      const clampedTime = clampValue(newTime, 0, duration)

      audioRef.current.currentTime = clampedTime
      setCurrentTime(clampedTime)
      onSeek?.(clampedTime)
    }

    const handleProgressMouseDown = () => setIsSeeking(true)
    const handleProgressMouseUp = () => setIsSeeking(false)

    const progressPercentage = getProgressPercentage(currentTime, duration)

    if (!audioUrl) {
      return (
        <AudioPlayerContainer className={className} $width={config.preview}>
          <EmptyState $fontSize={config.fontSize}>
            No audio file uploaded
          </EmptyState>
        </AudioPlayerContainer>
      )
    }

    return (
      <>
        <AudioPlayerContainer className={className} $width={config.preview}>
          {/* Preview Area */}
          {showPreview && (
            <AudioPreview
              $width={config.preview}
              $height={config.preview}
            >
              {currentFrameDetails ? (
                isVideoFile(currentFrameDetails.mimeType || undefined) ? (
                  <video
                    src={currentFrameDetails.url || ''}
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
                    src={getMediaUrl(currentFrameDetails, 'medium') || undefined}
                    alt={currentFrameDetails.category}
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
              {currentFrameDetails && (
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
                  <div style={{ fontWeight: '500' }}>{currentFrameDetails.category}</div>
                  {frames.length > 1 && (
                    <div style={{ fontSize: '0.625rem', opacity: 0.8 }}>
                      Frame{' '}
                      {frames.findIndex((f) => frameDetails[f.frame]?.id === currentFrameDetails.id) + 1} of{' '}
                      {frames.length}
                    </div>
                  )}
                </div>
              )}
            </AudioPreview>
          )}

          {/* Audio Controls */}
          <AudioControls>
            <audio
              ref={audioRef}
              src={audioUrl}
              onLoadStart={handleLoadStart}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={handleEnded}
              onError={handleError}
            />

            <AudioControlsRow>
              <PlayButton
                type="button"
                onClick={togglePlayPause}
                disabled={!isLoaded}
                $size={config.buttonSize}
                $fontSize={size === 'small' ? '0.875rem' : '1rem'}
              >
                {isLoading ? '...' : isPlaying ? '❚❚' : '▶'}
              </PlayButton>

              <TimeDisplay $fontSize={config.fontSize}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </TimeDisplay>
            </AudioControlsRow>

            {/* Progress bar with frame markers */}
            <ProgressBar
              $height={config.progressHeight}
              onClick={handleProgressClick}
              onMouseDown={handleProgressMouseDown}
              onMouseUp={handleProgressMouseUp}
            >
              <ProgressFill
                $width={progressPercentage}
                $transition={!isSeeking}
              />

              {/* Frame markers */}
              {duration > 0 &&
                frames.map((frame, index) => (
                  <FrameMarker
                    key={`${frame.frame}-${frame.timestamp}-${index}`}
                    $left={(frame.timestamp / duration) * 100}
                    title={`Frame at ${frame.timestamp}s`}
                  />
                ))}

              {/* Playhead */}
              <ProgressPlayhead
                $left={progressPercentage}
                $size={size === 'small' ? 12 : 14}
                $transition={!isSeeking}
              />
            </ProgressBar>
          </AudioControls>
        </AudioPlayerContainer>

        {/* Keyboard shortcuts help */}
        {size === 'large' && audioUrl && enableHotkeys && (
          <KeyboardShortcuts>
            <strong>Keyboard Shortcuts:</strong>
            <br />
            Space: Play/Pause • ←→: ±5s • ↑↓: ±10s • Home/End: Start/End
          </KeyboardShortcuts>
        )}
      </>
    )
  },
)

AudioPlayer.displayName = 'AudioPlayer'

export default AudioPlayer