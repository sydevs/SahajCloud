'use client'

import type { DefaultCellComponentProps } from 'payload'
import type { ReactNode } from 'react'

import { Link } from '@payloadcms/ui'

import { DirectUploadThumbnail } from './DirectUploadThumbnail'
import { RelationshipThumbnail } from './RelationshipThumbnail'
import { getThumbnailDimensions } from './utils'

export const ThumbnailCell: React.FC<
  DefaultCellComponentProps & { aspectRatio?: string; size?: 'small' | 'medium' | 'large' }
> = ({ cellData, rowData, link, collectionSlug, aspectRatio = '1:1', size = 'medium' }) => {
  const dimensions = getThumbnailDimensions(aspectRatio, size)

  // Determine the type of cell data we're dealing with
  const isPreviewUrl =
    typeof cellData === 'string' && (cellData.startsWith('/') || cellData.startsWith('http'))
  // Media relationship: either a numeric ID or a string ID (not a URL)
  const isMediaRelationship =
    typeof cellData === 'number' ||
    (typeof cellData === 'string' &&
      !cellData.startsWith('/') &&
      !cellData.startsWith('http') &&
      cellData.length > 10)
  const isDirectUpload =
    rowData?.url &&
    (rowData.mimeType?.startsWith('image/') || rowData.mimeType?.startsWith('video/'))

  let content: ReactNode

  if (isPreviewUrl) {
    // For previewUrl field - cellData contains the URL directly
    const isVideo = rowData?.mimeType?.startsWith('video/')

    content = (
      <div
        style={{
          position: 'relative',
          ...dimensions,
          overflow: 'hidden',
          borderRadius: '4px',
          backgroundColor: '#f5f5f5',
        }}
      >
        <img
          src={cellData}
          alt={rowData?.filename || 'Preview'}
          style={{
            objectFit: 'cover',
          }}
          sizes={`${dimensions.width}`}
        />
        {isVideo && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: 'white',
              fontSize: '16px',
              textShadow: '0 0 4px rgba(0,0,0,0.5)',
              backgroundColor: 'rgba(0,0,0,0.3)',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ▶
          </div>
        )}
      </div>
    )
  } else if (isMediaRelationship) {
    // For thumbnail relationship - cellData contains Media ID (number or string)
    content = (
      <RelationshipThumbnail cellData={String(cellData)} aspectRatio={aspectRatio} size={size} />
    )
  } else if (isDirectUpload) {
    // For direct upload thumbnails (backward compatibility)
    content = <DirectUploadThumbnail rowData={rowData} cellData={cellData} />
  } else {
    // Fallback for no data
    content = <div style={{ ...dimensions, backgroundColor: '#f5f5f5', borderRadius: '4px' }} />
  }

  // Wrap in Link if cell should be linked
  if (link && rowData?.id) {
    return (
      <Link
        href={`/admin/collections/${collectionSlug}/${rowData.id}`}
        style={{ display: 'inline-block' }}
      >
        {content}
      </Link>
    )
  }

  return <>{content}</>
}

export default ThumbnailCell
