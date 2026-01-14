'use client'

import { Thumbnail } from '@payloadcms/ui'

export interface BaseThumbnailCellProps {
  thumbnailUrl?: string
  mimeType?: string
  filename?: string
  collectionSlug?: string
}

/**
 * Base thumbnail cell component using Payload's built-in Thumbnail
 * Follows Payload's FileCell pattern with file CSS class structure
 */
export const BaseThumbnailCell: React.FC<BaseThumbnailCellProps> = ({
  thumbnailUrl,
  mimeType,
  filename,
  collectionSlug,
}) => {
  return (
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
}

export default BaseThumbnailCell
