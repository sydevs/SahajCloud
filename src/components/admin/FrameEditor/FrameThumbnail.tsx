'use client'

import type { FC } from 'react'

import type { Frame } from '@/payload-types'

import styles from './FrameThumbnail.module.css'

interface FrameThumbnailProps {
  frame: Partial<Pick<Frame, 'previewUrl' | 'mp4Url' | 'hlsUrl' | 'mimeType'>>
  /** Sizes the thumbnail. Its own module draws everything inside the box. */
  className?: string
  lazyLoad?: boolean
}

/**
 * FrameThumbnail - Displays frame media with automatic video fallback
 *
 * - Images/video thumbnails: Renders <img> with previewUrl
 * - Videos without thumbnail (dev): Renders <video> with preload="metadata"
 * - Shows play button indicator for video content
 */
export const FrameThumbnail: FC<FrameThumbnailProps> = ({ frame, className, lazyLoad = true }) => {
  const { previewUrl, mp4Url, hlsUrl, mimeType } = frame
  const isVideo = mimeType?.startsWith('video/')
  const alt = 'Frame'

  const box = `${styles['frame-thumbnail']}${className ? ` ${className}` : ''}`

  // Video indicator overlay
  const videoIndicator = isVideo ? (
    <div className={styles['video-indicator']}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
        <polygon points="5,3 19,12 5,21" />
      </svg>
    </div>
  ) : null

  if (previewUrl) {
    return (
      <div className={box}>
        <img src={previewUrl} alt={alt} loading={lazyLoad ? 'lazy' : undefined} />
        {videoIndicator}
      </div>
    )
  }

  if (isVideo && (mp4Url || hlsUrl)) {
    return (
      <div className={box}>
        <video
          muted
          preload="metadata"
          playsInline
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          disableRemotePlayback
        >
          {hlsUrl ? (
            <source
              src={hlsUrl}
              type={hlsUrl.endsWith('.m3u8') ? 'application/x-mpegURL' : undefined}
            />
          ) : null}
          {mp4Url ? <source src={mp4Url} type="video/mp4" /> : null}
        </video>
        {videoIndicator}
      </div>
    )
  }

  return <div className={box} />
}

export default FrameThumbnail
