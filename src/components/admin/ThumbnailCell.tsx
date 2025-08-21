'use client'

import React from 'react'
import Image from 'next/image'
import { DefaultCellComponentProps } from 'payload'
import { usePayloadAPI, Link } from '@payloadcms/ui'
import { RowData } from 'node_modules/payload/dist/admin/elements/Cell'

// Calculate dimensions based on aspect ratio and size
const getThumbailDimensions = (aspectRatio: string, size: 'small' | 'medium' | 'large') => {
  if (aspectRatio === '16:9') {
    switch (size) {
      case 'small':
        return { width: '60px', height: '34px' }
      case 'large':
        return { width: '120px', height: '67.5px' }
      case 'medium':
      default:
        return { width: '80px', height: '45px' }
    }
  }
  // Default 1:1
  switch (size) {
    case 'small':
      return { width: '40px', height: '40px' }
    case 'large':
      return { width: '80px', height: '80px' }
    case 'medium':
    default:
      return { width: '60px', height: '60px' }
  }
}

// Component for direct upload thumbnails
const DirectUploadThumbnail: React.FC<{ rowData: RowData; cellData: any }> = ({
  rowData,
  cellData,
}) => {
  const fileUrl = rowData?.url || cellData
  const mimeType = rowData?.mimeType
  const altText = rowData?.filename || 'Upload'

  if (!fileUrl) {
    return <div style={{ width: '60px', height: '60px', backgroundColor: '#f5f5f5', borderRadius: '4px' }} />
  }

  if (mimeType?.startsWith('video/')) {
    return (
      <div
        style={{
          position: 'relative',
          width: '60px',
          height: '60px',
          overflow: 'hidden',
          borderRadius: '4px',
          backgroundColor: '#f5f5f5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <video
          src={fileUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          muted
          preload="metadata"
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            fontSize: '20px',
            textShadow: '0 0 4px rgba(0,0,0,0.5)',
          }}
        >
          ▶
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '60px',
        height: '60px',
        overflow: 'hidden',
        borderRadius: '4px',
        backgroundColor: '#f5f5f5',
      }}
    >
      <Image
        src={fileUrl}
        alt={altText || ''}
        fill
        style={{
          objectFit: 'cover',
        }}
        sizes="60px"
      />
    </div>
  )
}

// Component for relationship thumbnails
const RelationshipThumbnail: React.FC<{
  cellData: any
  aspectRatio?: string
  size?: 'small' | 'medium' | 'large'
}> = ({ cellData, aspectRatio = '1:1', size = 'medium' }) => {
  const [{ data: media }] = usePayloadAPI('/api/media', {
    initialParams: {
      where: {
        id: {
          equals: cellData,
        },
      },
      limit: 1,
    },
  })

  const dimensions = getThumbailDimensions(aspectRatio, size)

  // Show loading placeholder while fetching
  if (!media?.docs?.[0]) {
    return <div style={{ ...dimensions, backgroundColor: '#f5f5f5', borderRadius: '4px' }} />
  }

  const mediaDoc = media.docs[0]
  const fileUrl = mediaDoc.url
  const altText = mediaDoc.alt || 'Thumbnail'

  if (!fileUrl) {
    return <div style={{ ...dimensions, backgroundColor: '#f5f5f5', borderRadius: '4px' }} />
  }

  return (
    <div
      style={{
        position: 'relative',
        ...dimensions,
        overflow: 'hidden',
        borderRadius: '4px',
        backgroundColor: '#f5f5f5',
      }}
    >
      <Image
        src={fileUrl}
        alt={altText || ''}
        fill
        style={{
          objectFit: 'cover',
        }}
        sizes={`${dimensions.width}`}
      />
    </div>
  )
}

export const ThumbnailCell: React.FC<
  DefaultCellComponentProps & { aspectRatio?: string; size?: 'small' | 'medium' | 'large' }
> = ({ cellData, rowData, link, collectionSlug, aspectRatio = '1:1', size = 'medium' }) => {
  // Determine if this is a direct upload thumbnail or a relationship field
  // For direct upload collections showing the upload itself (like Frames), we use rowData
  // For relationship fields (like Meditations.thumbnail), we use cellData to fetch from media collection

  // Check if cellData is a string ID (relationship) vs rowData having image/video mimeType (direct upload)
  const hasRelationshipData = typeof cellData === 'string' && cellData.length > 0
  const isDirectUploadImage =
    rowData?.url &&
    (rowData.mimeType?.startsWith('image/') || rowData.mimeType?.startsWith('video/'))

  let content: React.ReactNode

  if (isDirectUploadImage) {
    content = <DirectUploadThumbnail rowData={rowData} cellData={cellData} />
  } else if (!hasRelationshipData) {
    const dimensions = getThumbailDimensions(aspectRatio, size)
    content = <div style={{ ...dimensions, backgroundColor: '#f5f5f5', borderRadius: '4px' }} />
  } else {
    content = <RelationshipThumbnail cellData={cellData} aspectRatio={aspectRatio} size={size} />
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
