'use client'

import React, { useState, memo } from 'react'
import Image from 'next/image'
import type { Frame } from '@/payload-types'
import { isVideoFile, getMediaUrl } from './utils'
import { LIMITS } from './constants'
import { FrameItemContainer, FrameTags } from './styled'

export interface FrameItemProps {
  frame: Frame
  size?: number
  overlayValue?: number // Value to show in the overlay (timestamp for selected frames, duration for library)
  playOnHover?: boolean // Enable video play on hover
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
  onClick,
  onMouseEnter,
  onMouseLeave,
  isSelected = false,
  disabled = false,
  className = '',
}) => {
  const [isClicked, setIsClicked] = useState(false)

  const imageUrl = getMediaUrl(frame, 'small')
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
  }

  const imageContainerStyle: React.CSSProperties = {
    position: 'relative',
    width: `${size}px`,
    height: `${size}px`,
  }

  const renderMedia = () => {
    if (!imageUrl) {
      return (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#6b7280',
            fontSize: '0.75rem',
          }}
        >
          No preview
        </div>
      )
    }

    if (isVideo) {
      return (
        <video
          src={frame.url || ''}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          muted
          loop
          autoPlay={false}
        />
      )
    }

    return (
      <Image
        src={imageUrl}
        alt={frame.category || 'Frame'}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        width={frame.sizes?.small?.width || frame.width || size}
        height={frame.sizes?.small?.height || frame.height || size}
      />
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

        {overlayValue !== undefined && (
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
            {overlayValue}s
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
        {frame.tags && frame.tags.length > 0 && (
          <FrameTags>
            {frame.tags.map((tag) => (typeof tag === 'string' ? tag : tag.name)).join(', ')}
          </FrameTags>
        )}
      </div>
    </FrameItemContainer>
  )
}

// Memoize component for performance
export default memo(FrameItem)
