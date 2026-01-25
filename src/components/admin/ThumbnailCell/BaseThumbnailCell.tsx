'use client'

import type { CollectionSlug, DefaultCellComponentProps } from 'payload'

import { Link, Thumbnail } from '@payloadcms/ui'

/**
 * Props for BaseThumbnailCell extending Payload's DefaultCellComponentProps
 * with custom thumbnail-specific props
 */
export type BaseThumbnailCellProps = Partial<DefaultCellComponentProps> & {
  thumbnailUrl?: string
  mimeType?: string
  filename?: string
  /** Open link in new tab (custom extension for external links) */
  openInNewTab?: boolean
}

/**
 * Base thumbnail cell component using Payload's built-in Thumbnail
 * Follows Payload's DefaultCell wrapping pattern with file CSS class structure
 *
 * Interaction priority (matching Payload's DefaultCell):
 * 1. onClick - wraps in button, calls onClick with { cellData, collectionSlug, rowData }
 * 2. link && linkURL - wraps in Link for navigation
 * 3. No interaction - plain display
 */
export const BaseThumbnailCell: React.FC<BaseThumbnailCellProps> = ({
  thumbnailUrl,
  mimeType,
  filename,
  cellData,
  collectionSlug,
  rowData,
  className,
  link,
  linkURL,
  onClick,
  openInNewTab,
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

  // onClick takes priority - following Payload's DefaultCell pattern
  if (typeof onClick === 'function') {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          onClick({
            cellData,
            collectionSlug: collectionSlug as CollectionSlug,
            rowData: rowData ?? {},
          })
        }}
        style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
      >
        {content}
      </button>
    )
  }

  // link + linkURL for navigation
  if (link && linkURL) {
    // Use native anchor for new tab links, Payload Link for internal navigation
    if (openInNewTab) {
      return (
        <a href={linkURL} target="_blank" rel="noopener noreferrer" className={className}>
          {content}
        </a>
      )
    }
    return (
      <Link href={linkURL} prefetch={false} className={className}>
        {content}
      </Link>
    )
  }

  // Fallback: still support linkURL without link prop for backwards compatibility
  if (linkURL) {
    if (openInNewTab) {
      return (
        <a href={linkURL} target="_blank" rel="noopener noreferrer" className={className}>
          {content}
        </a>
      )
    }
    return (
      <Link href={linkURL} prefetch={false} className={className}>
        {content}
      </Link>
    )
  }

  // No interaction - plain display
  return <span className={className}>{content}</span>
}

export default BaseThumbnailCell
