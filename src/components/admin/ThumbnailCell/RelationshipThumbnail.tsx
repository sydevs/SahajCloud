'use client'

import { usePayloadAPI } from '@payloadcms/ui'

import { getThumbnailDimensions } from './utils'

interface RelationshipThumbnailProps {
  cellData: string
  aspectRatio?: string
  size?: 'small' | 'medium' | 'large'
}

/**
 * Component for relationship thumbnails
 * Handles thumbnails for media referenced via relationship fields
 */
export const RelationshipThumbnail: React.FC<RelationshipThumbnailProps> = ({
  cellData,
  aspectRatio = '1:1',
  size = 'medium',
}) => {
  const [{ data: media }] = usePayloadAPI('/api/images', {
    initialParams: {
      where: {
        id: {
          equals: cellData,
        },
      },
      limit: 1,
      select: { id: true, url: true, alt: true, filename: true },
    },
  })

  const dimensions = getThumbnailDimensions(aspectRatio, size)

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

export default RelationshipThumbnail
