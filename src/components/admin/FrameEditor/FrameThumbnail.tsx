'use client'

import type { CSSProperties } from 'react'

import type { Frame } from '@/payload-types'

interface FrameThumbnailProps {
  frame: Partial<Pick<Frame, 'previewUrl' | 'url' | 'streamUrl' | 'mimeType' | 'category'>>
  style: CSSProperties
  lazyLoad?: boolean
}

const videoIndicatorStyle: CSSProperties = {
  position: 'absolute',
  top: '4px',
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
  const { previewUrl, url, streamUrl, mimeType, category } = frame
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

  if (isVideo && (url || streamUrl)) {
    return (
      <div style={{ position: 'relative', ...style }}>
        <video
          style={{ ...style, pointerEvents: 'none' }}
          muted
          preload="metadata"
          playsInline
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          disableRemotePlayback
        >
          {streamUrl ? (
            <source
              src={streamUrl}
              type={streamUrl.endsWith('.m3u8') ? 'application/x-mpegURL' : undefined}
            />
          ) : null}
          {url ? <source src={url} type="video/mp4" /> : null}
        </video>
        {videoIndicator}
      </div>
    )
  }

  return <div style={style} />
}

export default FrameThumbnail
