'use client'

import type { DefaultCellComponentProps } from 'payload'

import { Link, Thumbnail } from '@payloadcms/ui'

import { SelectableCell } from '@/components/admin/helpers/drawerRowSelect'

/**
 * Props for BaseThumbnailCell extending Payload's DefaultCellComponentProps
 * with custom thumbnail-specific props
 */
export type BaseThumbnailCellProps = Omit<
  Partial<DefaultCellComponentProps>,
  'className' | 'onClick'
> & {
  thumbnailUrl?: string
  mimeType?: string
  filename?: string
  /** Open link in new tab (custom extension for external links) */
  openInNewTab?: boolean
  /**
   * The cell's own click, taken only outside a drawer's linked column. Not
   * Payload's `onClick`, which `renderCell` never fills for a custom cell.
   */
  onClick?: () => void
}

/**
 * Base thumbnail cell component using Payload's built-in Thumbnail
 * Follows Payload's DefaultCell wrapping pattern with file CSS class structure
 *
 * Interaction priority (matching Payload's DefaultCell):
 * 1. A list drawer's select, in the linked column - wraps in button, calls onSelect
 * 2. onClick - wraps in button, calls the caller's own handler
 * 3. linkURL - wraps in Link for navigation
 * 4. No interaction - plain display
 */
export const BaseThumbnailCell: React.FC<BaseThumbnailCellProps> = ({
  thumbnailUrl,
  mimeType,
  filename,
  collectionSlug,
  rowData,
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

  let fallback: React.ReactNode = <span>{content}</span>
  if (linkURL) {
    // Native anchor for new tab links, Payload Link for internal navigation
    fallback = openInNewTab ? (
      <a href={linkURL} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    ) : (
      <Link href={linkURL} prefetch={false}>
        {content}
      </Link>
    )
  }

  return (
    <SelectableCell
      collectionSlug={collectionSlug}
      fallback={fallback}
      link={link}
      onClick={onClick}
      rowData={rowData}
    >
      {content}
    </SelectableCell>
  )
}

export default BaseThumbnailCell
