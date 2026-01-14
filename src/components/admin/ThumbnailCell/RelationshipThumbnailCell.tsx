'use client'

import type { DefaultCellComponentProps } from 'payload'

import { usePayloadAPI } from '@payloadcms/ui'

import { BaseThumbnailCell } from './BaseThumbnailCell'

/**
 * Thumbnail cell for media relationship fields
 * Fetches media document via API since cellData contains just the media ID
 */
export const RelationshipThumbnailCell: React.FC<DefaultCellComponentProps> = ({
  cellData,
  collectionSlug,
}) => {
  // cellData is the media ID (number or string)
  const mediaId = cellData != null ? String(cellData) : null

  const [{ data: media }] = usePayloadAPI(mediaId ? '/api/images' : '', {
    initialParams: mediaId
      ? {
          where: { id: { equals: mediaId } },
          limit: 1,
          select: { id: true, url: true, mimeType: true, filename: true },
        }
      : undefined,
  })

  const mediaDoc = media?.docs?.[0]

  return (
    <BaseThumbnailCell
      thumbnailUrl={mediaDoc?.url as string | undefined}
      mimeType={mediaDoc?.mimeType as string | undefined}
      filename={mediaDoc?.filename as string | undefined}
      collectionSlug={collectionSlug}
    />
  )
}

export default RelationshipThumbnailCell
