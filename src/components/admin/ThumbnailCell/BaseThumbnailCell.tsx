'use client'

import { Link, Thumbnail } from '@payloadcms/ui'

export interface BaseThumbnailCellProps {
  thumbnailUrl?: string
  mimeType?: string
  filename?: string
  collectionSlug?: string
  /** URL to link to - wraps content in a Link */
  linkURL?: string
  /** Open link in new tab (only applies when linkURL is set) */
  openInNewTab?: boolean
  /** Click handler - alternative to linkURL for drawer behavior */
  onClick?: () => void
}

/**
 * Base thumbnail cell component using Payload's built-in Thumbnail
 * Follows Payload's FileCell pattern with file CSS class structure
 *
 * Interaction priority:
 * 1. onClick - for opening drawers or custom behavior
 * 2. linkURL - for navigation links
 * 3. No interaction - plain display
 */
export const BaseThumbnailCell: React.FC<BaseThumbnailCellProps> = ({
  thumbnailUrl,
  mimeType,
  filename,
  collectionSlug,
  linkURL,
  openInNewTab,
  onClick,
}) => {
  const content = (
    <div className="file">
      <Thumbnail
        className="file__thumbnail"
        collectionSlug={collectionSlug}
        fileSrc={thumbnailUrl}
        size="small"
      />
      <span className="file__filename">{mimeType || filename || '—'}</span>
    </div>
  )

  // onClick takes priority - for drawer behavior
  if (onClick) {
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault()
      onClick()
    }
    return (
      <a href="#" onClick={handleClick} style={{ cursor: 'pointer' }}>
        {content}
      </a>
    )
  }

  // linkURL for navigation
  if (linkURL) {
    // Use native anchor for new tab links, Payload Link for internal navigation
    if (openInNewTab) {
      return (
        <a href={linkURL} target="_blank" rel="noopener noreferrer">
          {content}
        </a>
      )
    }
    return (
      <Link href={linkURL} prefetch={false}>
        {content}
      </Link>
    )
  }

  return content
}

export default BaseThumbnailCell
