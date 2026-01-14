'use client'

import type { DefaultCellComponentProps } from 'payload'

import { BaseThumbnailCell } from './BaseThumbnailCell'

/**
 * Thumbnail cell for virtual URL fields (e.g., previewUrl)
 * cellData contains the URL directly from the virtual field's afterRead hook
 *
 * Link behavior:
 * - Uses Payload's linkURL if provided (first column behavior)
 * - Falls back to linking to the original file URL for viewing/download
 */
export const PreviewUrlThumbnailCell: React.FC<DefaultCellComponentProps> = ({
  cellData,
  rowData,
  collectionSlug,
  linkURL,
}) => {
  const thumbnailUrl = typeof cellData === 'string' ? cellData : undefined

  // Original file URL from rowData (fallback when Payload doesn't provide linkURL)
  const fallbackLinkURL = rowData?.url as string | undefined

  // Use Payload's linkURL if provided, otherwise use our fallback
  const resolvedLinkURL = linkURL ?? fallbackLinkURL

  // Open in new tab when using fallback URL (viewing/downloading the file)
  const shouldOpenInNewTab = !linkURL && !!fallbackLinkURL

  return (
    <BaseThumbnailCell
      thumbnailUrl={thumbnailUrl}
      mimeType={rowData?.mimeType as string | undefined}
      filename={rowData?.filename as string | undefined}
      collectionSlug={collectionSlug}
      linkURL={resolvedLinkURL}
      openInNewTab={shouldOpenInNewTab}
    />
  )
}

export default PreviewUrlThumbnailCell
