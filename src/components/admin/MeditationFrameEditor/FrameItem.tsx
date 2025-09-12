'use client'

import React, { useState, memo } from 'react'
import Image from 'next/image'
import { isVideoFile, getMediaUrl } from './utils'
import { LIMITS } from './constants'
import { FrameItemContainer, FrameTags } from './styled'
import { KeyframeData } from './types'

export interface FrameItemProps {
  frame: Omit<KeyframeData, 'timestamp'> & Partial<Pick<KeyframeData, 'timestamp'>>
  size?: number
  overlayValue?: string // Value to show in the overlay (timestamp for selected frames, duration for library)
  playOnHover?: boolean // Enable video play on hover
  usePreviewUrl?: boolean // Use previewUrl instead of original media - defaults to true
  showVideoOnHover?: boolean // Show video element on hover for video frames - defaults to false
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  isSelected?: boolean // Selection state for frame library
  disabled?: boolean
  className?: string
}

const FrameItem: React.FC<FrameItemProps> = ({
  frame,
  size = 160,
  overlayValue,
  playOnHover = false,
  usePreviewUrl = true,
  showVideoOnHover = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  isSelected = false,
  disabled = false,
  className = '',
}) => {
  const [isClicked, setIsClicked] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [imageError, setImageError] = useState(false)

  const imageUrl = getMediaUrl(frame, 'small')
  const previewUrl = frame.previewUrl || imageUrl
  const isVideo = isVideoFile(frame.mimeType || undefined)

  const handleClick = () => {
    if (disabled || !onClick) return

    setIsClicked(true)
    setTimeout(() => setIsClicked(false), LIMITS.CLICK_ANIMATION_DURATION)

    onClick()
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    onMouseEnter?.()

    if (onClick && !disabled && !isClicked) {
      const target = e.currentTarget as HTMLElement
      target.style.transform = 'scale(1.05)'
      target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)'
    }

    if (playOnHover && isVideo) {
      const video = e.currentTarget.querySelector('video')
      video?.play()
    }

    if (showVideoOnHover && isVideo) {
      setShowVideo(true)
    }
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    onMouseLeave?.()

    if (onClick && !disabled && !isClicked) {
      const target = e.currentTarget as HTMLElement
      target.style.transform = 'scale(1)'
      target.style.boxShadow = 'none'
    }

    if (playOnHover && isVideo) {
      const video = e.currentTarget.querySelector('video')
      video?.pause()
    }

    if (showVideoOnHover && isVideo) {
      setShowVideo(false)
    }
  }

  const imageContainerStyle: React.CSSProperties = {
    position: 'relative',
    width: `${size}px`,
    height: `${size}px`,
  }

  const renderMedia = () => {
    const displayUrl = usePreviewUrl ? previewUrl : imageUrl

    if (!displayUrl || imageError) {
      return (
        <div
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            backgroundColor: '#f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: '#6b7280',
            fontSize: '0.75rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>🧘</div>
          <div>{frame.category}</div>
        </div>
      )
    }

    // For video frames with showVideoOnHover enabled, show video when hovering
    if (isVideo && showVideoOnHover && showVideo) {
      return (
        <>
          {/* Show preview image as background while video loads */}
          <img
            src={displayUrl}
            alt={frame.category || 'Video Frame'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
            }}
            width={frame.sizes?.small?.width || size}
            height={frame.sizes?.small?.height || size}
            onError={() => setImageError(true)}
          />
          {/* Loading spinner */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <path
              d="M2,12A11.2,11.2,0,0,1,13,1.05C12.67,1,12.34,1,12,1a11,11,0,0,0,0,22c.34,0,.67,0,1-.05C6,23,2,17.74,2,12Z"
              fill="white"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                dur="0.6s"
                values="0 12 12;360 12 12"
                repeatCount="indefinite"
              />
            </path>
          </svg>
          {/* Video element on top */}
          <video
            src={frame.url || ''}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
            muted
            loop
            autoPlay={playOnHover}
          />
        </>
      )
    }

    // Default case: show preview image
    return (
      <>
        <img
          src={displayUrl}
          alt={frame.category || (isVideo ? 'Video Frame' : 'Frame')}
          style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }}
          width={frame.sizes?.small?.width || frame.width || size}
          height={frame.sizes?.small?.height || frame.height || size}
          onError={() => setImageError(true)}
        />
        {/* Play button overlay for video indication when using preview */}
        {isVideo && usePreviewUrl && (
          <div
            style={{
              position: 'absolute',
              bottom: '4px',
              left: '4px',
              backgroundColor: 'rgba(0,0,0,0.45)',
              color: 'white',
              fontSize: '0.875rem',
              padding: '4px',
              borderRadius: '4px',
              lineHeight: 1,
              fontWeight: '600',
            }}
          >
            ▶
          </div>
        )}
      </>
    )
  }

  return (
    <FrameItemContainer
      className={`frame-item ${className}`}
      $size={size}
      $disabled={disabled}
      $clickable={!!onClick}
      $selected={isSelected || isClicked}
      $clicked={isClicked}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div style={imageContainerStyle}>
        {renderMedia()}

        {overlayValue && (
          <div
            style={{
              position: 'absolute',
              bottom: '4px',
              right: '4px',
              backgroundColor: 'rgba(0,0,0,0.85)',
              color: 'white',
              fontSize: '0.875rem',
              padding: '4px 8px',
              borderRadius: '4px',
              lineHeight: 1,
              fontWeight: '600',
            }}
          >
            {overlayValue}
          </div>
        )}
      </div>

      <div style={{ padding: '0.125rem', flexShrink: 0 }}>
        <div
          style={{
            fontSize: '0.9rem',
            fontWeight: '600',
            textAlign: 'center',
            color: '#374151',
            textTransform: 'capitalize',
          }}
        >
          {frame.category}
        </div>
        {frame.tags && frame.tags.length > 0 && <FrameTags>{frame.tags.join(', ')}</FrameTags>}
      </div>
    </FrameItemContainer>
  )
}

// Memoize component for performance
export default memo(FrameItem)
