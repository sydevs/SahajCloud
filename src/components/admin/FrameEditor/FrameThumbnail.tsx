'use client'

import type { CSSProperties } from 'react'

import type { Frame } from '@/payload-types'

interface FrameThumbnailProps {
  frame: Partial<Pick<Frame, 'previewUrl' | 'url' | 'mimeType' | 'category'>>
  style: CSSProperties
  lazyLoad?: boolean
}

/**
 * FrameThumbnail - Displays frame media with automatic video fallback
 *
 * - Images/video thumbnails: Renders <img> with previewUrl
 * - Videos without thumbnail (dev): Renders <video> with preload="metadata"
 */
export const FrameThumbnail: React.FC<FrameThumbnailProps> = ({
  frame,
  style,
  lazyLoad = false,
}) => {
  const { previewUrl, url, mimeType, category } = frame
  const isVideo = mimeType?.startsWith('video/')
  const alt = category || 'Frame'

  if (previewUrl) {
    return <img src={previewUrl} alt={alt} style={style} loading={lazyLoad ? 'lazy' : undefined} />
  }

  if (isVideo && url) {
    return <video src={url} style={style} muted preload="metadata" playsInline />
  }

  return <div style={style} />
}

export default FrameThumbnail
