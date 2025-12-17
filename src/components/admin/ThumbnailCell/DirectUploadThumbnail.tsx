'use client'

import type { RowData } from 'node_modules/payload/dist/admin/elements/Cell'

interface DirectUploadThumbnailProps {
  rowData: RowData
  cellData: unknown
}

/**
 * Component for direct upload thumbnails
 * Handles thumbnails for files uploaded directly to the collection
 */
export const DirectUploadThumbnail: React.FC<DirectUploadThumbnailProps> = ({
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
    // Use previewUrl virtual field (works for both Cloudflare Stream thumbnails and image thumbnails)
    const previewUrl = rowData?.previewUrl

    if (previewUrl) {
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
            src={previewUrl}
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

export default DirectUploadThumbnail
