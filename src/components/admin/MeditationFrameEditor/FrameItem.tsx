'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import type { Frame } from '@/payload-types'

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

  // Use small size for images, fallback to full URL
  const imageUrl = frame.sizes?.small?.url || frame.url
  const isVideo = frame.mimeType?.startsWith('video/')

  const handleClick = () => {
    if (disabled || !onClick) return

    // Trigger click animation for interactive frames
    setIsClicked(true)
    setTimeout(() => setIsClicked(false), 300)

    onClick()
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    onMouseEnter?.()

    // Scale effect for interactive frames
    if (onClick && !disabled && !isClicked) {
      const target = e.currentTarget as HTMLElement
      target.style.transform = 'scale(1.05)'
      target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)'
    }

    // Play video on hover
    if (playOnHover && isVideo) {
      const video = e.currentTarget.querySelector('video')
      video?.play()
    }
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    onMouseLeave?.()

    // Reset scale effect for interactive frames
    if (onClick && !disabled && !isClicked) {
      const target = e.currentTarget as HTMLElement
      target.style.transform = 'scale(1)'
      target.style.boxShadow = 'none'
    }

    // Pause video on hover leave
    if (playOnHover && isVideo) {
      const video = e.currentTarget.querySelector('video')
      video?.pause()
    }
  }

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    cursor: disabled ? 'not-allowed' : onClick ? 'pointer' : 'default',
    opacity: disabled ? 0.6 : 1,
    width: `${size}px`,
    border: isSelected || isClicked ? '2px solid #28a745' : '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: isSelected || isClicked ? '#f8fff9' : '#fff',
    transition: 'all 0.2s ease-in-out',
    transform: isClicked ? 'scale(1.08)' : 'scale(1)',
    boxShadow: isSelected || isClicked ? '0 6px 12px rgba(40, 167, 69, 0.3)' : 'none',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
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
            fontSize: '0.25rem',
          }}
        >
          No preview
        </div>
      )
    }

    if (isVideo) {
      return (
        <video
          src={frame.url || undefined}
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
        width={frame.sizes?.small?.width || frame.width || 160}
        height={frame.sizes?.small?.height || frame.height || 160}
      />
    )
  }

  return (
    <div
      className={`frame-item ${className}`}
      style={containerStyle}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Image/Video container */}
      <div style={imageContainerStyle}>
        {renderMedia()}

        {/* Overlay with value */}
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

      {/* Category and tags info */}
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
          <div
            style={{
              fontSize: '0.75rem',
              color: '#6b7280',
              textAlign: 'center',
            }}
          >
            {frame.tags.map((tag) => (typeof tag === 'string' ? tag : tag.name)).join(', ')}
          </div>
        )}
      </div>
    </div>
  )
}

export default FrameItem
