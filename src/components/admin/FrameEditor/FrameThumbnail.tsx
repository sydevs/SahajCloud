'use client'

import type { CSSProperties } from 'react'

import type { Frame } from '@/payload-types'

interface FrameThumbnailProps {
  frame: Partial<Pick<Frame, 'previewUrl' | 'url' | 'mimeType' | 'category'>>
  style: CSSProperties
  lazyLoad?: boolean
}

const videoIndicatorStyle: CSSProperties = {
  position: 'absolute',
  bottom: '4px',
  left: '4px',
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  borderRadius: '50%',
  width: '20px',
  height: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

/**
 * FrameThumbnail - Displays frame media with automatic video fallback
 *
 * - Images/video thumbnails: Renders <img> with previewUrl
 * - Videos without thumbnail (dev): Renders <video> with preload="metadata"
 * - Shows play button indicator for video content
 */
export const FrameThumbnail: React.FC<FrameThumbnailProps> = ({
  frame,
  style,
  lazyLoad = true,
}) => {
  const { previewUrl, url, mimeType, category } = frame
  const isVideo = mimeType?.startsWith('video/')
  const alt = category || 'Frame'

  // Video indicator overlay
  const videoIndicator = isVideo ? (
    <div style={videoIndicatorStyle}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
        <polygon points="5,3 19,12 5,21" />
      </svg>
    </div>
  ) : null

  if (previewUrl) {
    return (
      <div style={{ position: 'relative', ...style }}>
        <img src={previewUrl} alt={alt} style={style} loading={lazyLoad ? 'lazy' : undefined} />
        {videoIndicator}
      </div>
    )
  }

  if (isVideo && url) {
    return (
      <div style={{ position: 'relative', ...style }}>
        <video src={url} style={style} muted preload="metadata" playsInline />
        {videoIndicator}
      </div>
    )
  }

  return <div style={style} />
}

export default FrameThumbnail
