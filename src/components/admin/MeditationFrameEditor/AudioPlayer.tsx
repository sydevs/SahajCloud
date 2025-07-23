'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import type { AudioPlayerState, FrameData } from './types'

interface AudioPlayerProps {
  audioUrl: string
  frames: FrameData[]
  onTimeChange?: (currentTime: number) => void
  onSeek?: (time: number) => void
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  frames,
  onTimeChange,
  onSeek,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    isLoaded: false,
    isLoading: true,
  })

  // Update current time and notify parent
  const updateCurrentTime = useCallback(() => {
    if (audioRef.current) {
      const currentTime = Math.floor(audioRef.current.currentTime) // Whole seconds
      setState(prev => ({ ...prev, currentTime }))
      onTimeChange?.(currentTime)
    }
  }, [onTimeChange])

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadStart = () => {
      setState(prev => ({ ...prev, isLoading: true, isLoaded: false }))
    }

    const handleLoadedMetadata = () => {
      setState(prev => ({
        ...prev,
        duration: Math.floor(audio.duration),
        isLoaded: true,
        isLoading: false,
      }))
    }

    const handleTimeUpdate = updateCurrentTime

    const handlePlay = () => {
      setState(prev => ({ ...prev, isPlaying: true }))
    }

    const handlePause = () => {
      setState(prev => ({ ...prev, isPlaying: false }))
    }

    const handleEnded = () => {
      setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }))
    }

    const handleError = () => {
      setState(prev => ({ ...prev, isLoading: false, isLoaded: false }))
    }

    // Add event listeners
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      // Cleanup event listeners
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [updateCurrentTime])

  // Play/Pause toggle
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (state.isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
    }
  }

  // Seek to specific time
  const seekTo = (time: number) => {
    if (audioRef.current && state.isLoaded) {
      const clampedTime = Math.max(0, Math.min(time, state.duration))
      audioRef.current.currentTime = clampedTime
      setState(prev => ({ ...prev, currentTime: Math.floor(clampedTime) }))
      onSeek?.(Math.floor(clampedTime))
    }
  }

  // Handle timeline click
  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !state.isLoaded) return

    const rect = timelineRef.current.getBoundingClientRect()
    const clickX = event.clientX - rect.left
    const timelineWidth = rect.width
    const clickTime = (clickX / timelineWidth) * state.duration

    seekTo(clickTime)
  }

  // Format time display (MM:SS)
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Calculate progress percentage
  const progressPercentage = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        style={{ display: 'none' }}
      />

      {/* Controls */}
      <div className="audio-controls">
        <button
          type="button"
          onClick={togglePlayPause}
          disabled={!state.isLoaded}
          className="play-pause-btn"
          style={{
            padding: '0.5rem 1rem',
            marginRight: '1rem',
            backgroundColor: state.isLoaded ? '#0066cc' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: state.isLoaded ? 'pointer' : 'not-allowed',
          }}
        >
          {state.isLoading ? '...' : state.isPlaying ? 'Pause' : 'Play'}
        </button>

        <span className="time-display" style={{ marginRight: '1rem', fontFamily: 'monospace' }}>
          {formatTime(state.currentTime)} / {formatTime(state.duration)}
        </span>

        {state.isLoaded && (
          <span className="current-time-display" style={{ fontSize: '0.875rem', color: '#666' }}>
            Current: {state.currentTime}s
          </span>
        )}
      </div>

      {/* Timeline */}
      <div className="timeline-container" style={{ marginTop: '1rem' }}>
        <div
          ref={timelineRef}
          className="timeline"
          onClick={handleTimelineClick}
          style={{
            width: '100%',
            height: '30px',
            backgroundColor: '#e0e0e0',
            borderRadius: '15px',
            position: 'relative',
            cursor: state.isLoaded ? 'pointer' : 'not-allowed',
            border: '1px solid #ccc',
          }}
        >
          {/* Progress bar */}
          <div
            className="timeline-progress"
            style={{
              width: `${progressPercentage}%`,
              height: '100%',
              backgroundColor: '#0066cc',
              borderRadius: '15px',
              transition: 'width 0.1s ease',
            }}
          />

          {/* Frame markers */}
          {state.isLoaded && frames.map((frame, index) => {
            const markerPosition = (frame.timestamp / state.duration) * 100
            return (
              <div
                key={`marker-${frame.frame}-${frame.timestamp}`}
                className="frame-marker"
                style={{
                  position: 'absolute',
                  left: `${markerPosition}%`,
                  top: '0',
                  width: '2px',
                  height: '100%',
                  backgroundColor: '#ff6600',
                  zIndex: 2,
                }}
                title={`Frame ${index + 1} at ${frame.timestamp}s`}
              />
            )
          })}

          {/* Current time indicator */}
          <div
            className="time-indicator"
            style={{
              position: 'absolute',
              left: `${progressPercentage}%`,
              top: '-5px',
              width: '2px',
              height: '40px',
              backgroundColor: '#ff0000',
              zIndex: 3,
              transform: 'translateX(-1px)',
            }}
          />
        </div>

        {/* Timeline labels */}
        <div className="timeline-labels" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.75rem', color: '#666' }}>
          <span>0:00</span>
          <span>{formatTime(state.duration)}</span>
        </div>
      </div>

      {/* Status */}
      {state.isLoading && (
        <div className="loading-status" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#666' }}>
          Loading audio...
        </div>
      )}
      {!state.isLoaded && !state.isLoading && (
        <div className="error-status" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#cc0000' }}>
          Failed to load audio file
        </div>
      )}
    </div>
  )
}

export default AudioPlayer