'use client'

import type { DefaultCellComponentProps, UploadFieldClient } from 'payload'

import { useDocumentDrawer, usePayloadAPI } from '@payloadcms/ui'
import { useCallback } from 'react'

import { BaseThumbnailCell } from './BaseThumbnailCell'

/**
 * Thumbnail cell for upload relationship fields (e.g., photo -> images)
 * Fetches the related document via API since cellData contains just the ID
 *
 * Opens the related document in a drawer overlay when clicked
 */
export const RelationshipThumbnailCell: React.FC<DefaultCellComponentProps> = ({
  cellData,
  collectionSlug,
  rowData,
  className,
  field,
}) => {
  // Get the target collection from the field config
  const uploadField = field as UploadFieldClient
  const relationTo = Array.isArray(uploadField.relationTo)
    ? uploadField.relationTo[0]
    : uploadField.relationTo

  // cellData is the related document ID (number or string)
  const relatedId = cellData != null ? String(cellData) : null

  // Document drawer for opening related document in overlay
  // useDocumentDrawer expects number | null | undefined for id
  const [DocumentDrawer, , { openDrawer }] = useDocumentDrawer({
    collectionSlug: relationTo,
    id: relatedId != null ? Number(relatedId) : undefined,
  })

  // Wrap openDrawer to match Payload's onClick signature
  const handleClick = useCallback(
    (_args: { cellData: unknown; collectionSlug: string; rowData: Record<string, unknown> }) => {
      openDrawer()
    },
    [openDrawer],
  )

  const [{ data: relatedDoc }] = usePayloadAPI(relatedId ? `/api/${relationTo}` : '', {
    initialParams: relatedId
      ? {
          where: { id: { equals: relatedId } },
          limit: 1,
          select: { url: true, mimeType: true, filename: true },
        }
      : undefined,
  })

  const doc = relatedDoc?.docs?.[0]

  return (
    <>
      <BaseThumbnailCell
        thumbnailUrl={doc?.url as string | undefined}
        mimeType={doc?.mimeType as string | undefined}
        filename={doc?.filename as string | undefined}
        cellData={cellData}
        collectionSlug={collectionSlug}
        rowData={rowData}
        className={className}
        onClick={relatedId ? handleClick : undefined}
      />
      <DocumentDrawer />
    </>
  )
}

export default RelationshipThumbnailCell
