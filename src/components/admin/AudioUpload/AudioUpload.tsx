'use client'

import {
  CopyToClipboard,
  fieldBaseClass,
  useConfig,
  useDocumentInfo,
  useLivePreviewContext,
} from '@payloadcms/ui'
import { formatFilesize } from 'payload/shared'

const baseClass = 'file-field'
const detailsClass = 'file-details'
const metaClass = 'file-meta'

/**
 * Custom Upload component for the Meditations collection.
 *
 * Features:
 * - Recreates FileDetails wrapper using PayloadCMS CSS classes
 * - Composes FileMeta content + audio player INSIDE the wrapper
 * - Auto-hides when live preview is open to maximize space for frame editing
 */
export default function AudioUpload() {
  const { data, collectionSlug } = useDocumentInfo()
  const { isLivePreviewing } = useLivePreviewContext()
  const {
    config: { serverURL },
  } = useConfig()

  // Hide when live preview is open to maximize space for frame editing
  if (isLivePreviewing) {
    return null
  }

  // Extract file data
  const filename = data?.filename as string | undefined
  const filesize = data?.filesize as number | undefined
  const mimeType = (data?.mimeType as string | undefined) || 'audio/*'
  const virtualUrl = data?.url as string | undefined
  const audioUrl =
    virtualUrl || (filename ? `${serverURL}/api/${collectionSlug}/file/${filename}` : null)

  // No file uploaded yet - let Payload handle the dropzone
  if (!filename || !audioUrl) {
    return null
  }

  return (
    <div className={[fieldBaseClass, baseClass].filter(Boolean).join(' ')}>
      <div className={detailsClass}>
        <header>
          <div className={`${detailsClass}__main-detail`}>
            {/* FileMeta-style content */}
            <div className={metaClass}>
              <div className={`${metaClass}__url`}>
                <a href={audioUrl} rel="noopener noreferrer" target="_blank">
                  {filename}
                </a>
                <CopyToClipboard defaultMessage="Copy URL" value={audioUrl} />
              </div>
              <div className={`${metaClass}__size-type`}>
                {filesize ? formatFilesize(filesize) : ''} - {mimeType}
              </div>
            </div>

            {/* Audio player inside file-details - key prevents re-render resets */}
            <audio key={audioUrl} controls src={audioUrl} style={{ width: '100%', height: '40px' }}>
              Your browser does not support the audio element.
            </audio>
          </div>
        </header>
      </div>
    </div>
  )
}
