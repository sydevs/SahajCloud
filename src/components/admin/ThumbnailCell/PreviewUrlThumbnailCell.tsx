'use client'

import type { DefaultCellComponentProps } from 'payload'

import { BaseThumbnailCell } from './BaseThumbnailCell'

/**
 * Thumbnail cell for virtual URL fields (e.g., previewUrl)
 * cellData contains the URL directly from the virtual field's afterRead hook
 */
export const PreviewUrlThumbnailCell: React.FC<DefaultCellComponentProps> = ({
  cellData,
  rowData,
  collectionSlug,
}) => {
  const thumbnailUrl = typeof cellData === 'string' ? cellData : undefined

  return (
    <BaseThumbnailCell
      thumbnailUrl={thumbnailUrl}
      mimeType={rowData?.mimeType as string | undefined}
      filename={rowData?.filename as string | undefined}
      collectionSlug={collectionSlug}
    />
  )
}

export default PreviewUrlThumbnailCell
