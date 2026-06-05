'use client'

import type { RelationshipDoc } from './relationshipDocLoader'
import type { DefaultCellComponentProps, UploadFieldClient } from 'payload'

import { useDocumentDrawer } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'


import { BaseThumbnailCell } from './BaseThumbnailCell'
import { relationshipDocLoader } from './relationshipDocLoader'

/**
 * Subscribes to the batched relationship-doc loader so every thumbnail cell on
 * a list page resolves through one shared request instead of one fetch per row
 * (the #460 N+1). Returns `undefined` while loading, then the doc or `null`.
 */
function useRelationshipDoc(
  relationTo: string,
  id: string | null,
): RelationshipDoc | null | undefined {
  const [doc, setDoc] = useState<RelationshipDoc | null | undefined>(undefined)

  useEffect(() => {
    if (id == null) {
      setDoc(null)
      return
    }
    let active = true
    void relationshipDocLoader.load(relationTo, id).then((resolved) => {
      if (active) setDoc(resolved)
    })
    return () => {
      active = false
    }
  }, [relationTo, id])

  return doc
}

/**
 * Thumbnail cell for upload relationship fields (e.g., photo -> images).
 * cellData is just the related document ID; the related image's
 * url/mimeType/filename are resolved via the batched loader (one request per
 * list page instead of one per row).
 *
 * Opens the related document in a drawer overlay when clicked.
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

  const doc = useRelationshipDoc(relationTo, relatedId)

  return (
    <>
      <BaseThumbnailCell
        thumbnailUrl={doc?.url}
        mimeType={doc?.mimeType}
        filename={doc?.filename}
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
