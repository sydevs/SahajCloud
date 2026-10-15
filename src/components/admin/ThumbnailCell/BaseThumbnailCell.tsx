'use client'

import type { DefaultCellComponentProps } from 'payload'

import { Link, Thumbnail } from '@payloadcms/ui'

import { CellButton, useDrawerRowSelect } from '@/components/admin/drawerRowSelect'

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
 * 1. A list drawer's select, in the linked column - wraps in button, calls onSelect
 * 2. onClick - wraps in button, calls onClick with { cellData, collectionSlug, rowData }
 * 3. linkURL - wraps in Link for navigation
 * 4. No interaction - plain display
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
  const handleClick = useDrawerRowSelect({ cellData, collectionSlug, link, onClick, rowData })

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

  if (handleClick) {
    return (
      <CellButton className={className} onClick={handleClick}>
        {content}
      </CellButton>
    )
  }

  if (linkURL) {
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

  // No interaction - plain display
  return <span className={className}>{content}</span>
}

export default BaseThumbnailCell
