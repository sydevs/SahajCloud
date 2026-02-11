'use client'

import type { DefaultCellComponentProps } from 'payload'

import { BaseThumbnailCell } from './BaseThumbnailCell'

/**
 * Props for PreviewUrlThumbnailCell, extending DefaultCellComponentProps with
 * custom serverProps from previewUrlField configuration.
 */
interface PreviewUrlThumbnailCellProps extends DefaultCellComponentProps {
  /**
   * Field name containing the full file URL for fallback link.
   * Passed via serverProps from previewUrlField configuration.
   * Default: 'url'
   */
  fileUrlField?: string
}

/**
 * Thumbnail cell for virtual URL fields (e.g., previewUrl)
 * cellData contains the URL directly from the virtual field's afterRead hook
 *
 * Link behavior:
 * - First column (link=true): Links to document edit page (Payload's default)
 * - Non-first column: Links to original file URL for viewing/download (opens in new tab)
 *
 * Interaction priority (following Payload's DefaultCell pattern):
 * 1. onClick - calls onClick with { cellData, collectionSlug, rowData }
 * 2. link && linkURL - custom navigation link
 * 3. link (no linkURL) - document edit page link
 * 4. Fallback - external file link (opens in new tab)
 */
export const PreviewUrlThumbnailCell: React.FC<PreviewUrlThumbnailCellProps> = ({
  cellData,
  rowData,
  collectionSlug,
  className,
  link,
  linkURL,
  onClick,
  fileUrlField = 'url',
}) => {
  const thumbnailUrl = typeof cellData === 'string' ? cellData : undefined

  // Original file URL from rowData (for non-first-column fallback)
  const fallbackLinkURL = rowData?.[fileUrlField] as string | undefined

  // Construct document URL when link=true (first column) but no custom linkURL
  // This matches Payload's DefaultCell behavior
  const documentUrl =
    link && !linkURL && collectionSlug && rowData?.id
      ? `/admin/collections/${collectionSlug}/${rowData.id}`
      : undefined

  // Priority: linkURL (custom) > documentUrl (first column) > fallbackLinkURL (file link)
  const resolvedLinkURL = linkURL ?? documentUrl ?? fallbackLinkURL

  // Open in new tab only when using file URL fallback (not document or custom links)
  const shouldOpenInNewTab = !linkURL && !documentUrl && !!fallbackLinkURL

  return (
    <BaseThumbnailCell
      thumbnailUrl={thumbnailUrl}
      mimeType={rowData?.mimeType as string | undefined}
      filename={rowData?.filename as string | undefined}
      cellData={cellData}
      collectionSlug={collectionSlug}
      rowData={rowData}
      className={className}
      link={link}
      linkURL={resolvedLinkURL}
      onClick={onClick}
      openInNewTab={shouldOpenInNewTab}
    />
  )
}

export default PreviewUrlThumbnailCell
