'use client'

import type { CollectionSlug, DefaultCellComponentProps } from 'payload'

import { Link, Thumbnail, useListDrawerContext } from '@payloadcms/ui'

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
 * 3. link && linkURL - wraps in Link for navigation
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
  // Payload hands a list drawer's select handler to its own default cell only, so
  // a custom Cell in the linked column has to call it itself (#942). Outside a
  // drawer this context is empty.
  const { drawerSlug, onSelect } = useListDrawerContext()

  const doc = rowData

  const selectInDrawer =
    link && drawerSlug && doc && typeof onSelect === 'function'
      ? () => {
          onSelect({
            collectionSlug: collectionSlug as CollectionSlug,
            doc,
            docID: String(doc.id),
          })
        }
      : undefined

  // The drawer select replaces an onClick prop, as RenderDefaultCell overwrites it.
  const handleClick =
    selectInDrawer ??
    (typeof onClick === 'function'
      ? () => {
          onClick({
            cellData,
            collectionSlug: collectionSlug as CollectionSlug,
            rowData: rowData ?? {},
          })
        }
      : undefined)

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
      <button
        type="button"
        className={className}
        onClick={handleClick}
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
