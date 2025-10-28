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
const DirectUploadThumbnail: React.FC<{ rowData: RowData; cellData: unknown }> = ({
  rowData,
  cellData,
}) => {
  const fileUrl = rowData?.url || (typeof cellData === 'string' ? cellData : undefined)
  const mimeType = rowData?.mimeType
  const altText = rowData?.filename || 'Upload'

  if (!fileUrl) {
    return (
      <div
        style={{ width: '60px', height: '60px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}
      />
    )
  }

  if (mimeType?.startsWith('video/')) {
    // Check if we have a generated thumbnail in the sizes object
    const thumbnailUrl = rowData?.sizes?.small?.url

    if (thumbnailUrl) {
      // Display generated thumbnail with play button overlay
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
          <img
            src={thumbnailUrl}
            alt={altText}
            style={{
              objectFit: 'cover',
            }}
            sizes="60px"
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
              backgroundColor: 'rgba(0,0,0,0.3)',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ▶
          </div>
        </div>
      )
    }

    // Fallback to original video element if no thumbnail
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
      <img
        src={fileUrl}
        alt={altText || ''}
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
  cellData: string
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
      <img
        src={fileUrl}
        alt={altText || ''}
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
  const dimensions = getThumbailDimensions(aspectRatio, size)

  // Determine the type of cell data we're dealing with
  const isPreviewUrl =
    typeof cellData === 'string' && (cellData.startsWith('/') || cellData.startsWith('http'))
  const isMediaRelationship =
    typeof cellData === 'string' &&
    !cellData.startsWith('/') &&
    !cellData.startsWith('http') &&
    cellData.length > 10
  const isDirectUpload =
    rowData?.url &&
    (rowData.mimeType?.startsWith('image/') || rowData.mimeType?.startsWith('video/'))

  let content: React.ReactNode

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
    // For thumbnail relationship - cellData contains Media ID
    content = <RelationshipThumbnail cellData={cellData} aspectRatio={aspectRatio} size={size} />
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
