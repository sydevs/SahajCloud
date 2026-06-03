'use client'

import {
  Banner,
  Upload,
  useAllFormFields,
  useAuth,
  useConfig,
  useDocumentInfo,
  useLivePreviewContext,
} from '@payloadcms/ui'

import { countFramesBeyondDuration } from '@/lib/meditations/framesBeyondDuration'

/** Format a whole-second count as M:SS for the drift banner. */
function formatSeconds(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.round(totalSeconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Custom Upload component for the Meditations collection.
 *
 * Delegates replace/remove to PayloadCMS's native <Upload>, which renders the
 * dropzone when empty and FileDetails (meta + replace + remove) when a file
 * exists. The remove button is shown to admins only via `hideRemoveFile`;
 * the real boundary is the server-side restrictUploadToAdmin beforeChange hook.
 *
 * On top of native <Upload> it adds two things Payload can't:
 * - an <audio> player for the saved file, and
 * - a drift Banner when frame timestamps fall beyond the audio length (e.g.
 *   after replacing the audio with a shorter file).
 *
 * Auto-hides when live preview is open to maximize space for frame editing.
 */
export default function AudioUpload() {
  const { data, collectionSlug } = useDocumentInfo()
  const { isLivePreviewing } = useLivePreviewContext()
  const { user } = useAuth()
  const {
    config: { serverURL },
    getEntityConfig,
  } = useConfig()
  const [fields] = useAllFormFields()

  // Hide when live preview is open to maximize space for frame editing
  if (isLivePreviewing) {
    return null
  }

  if (!collectionSlug) return null
  const uploadConfig = getEntityConfig({ collectionSlug })?.upload
  if (!uploadConfig) return null

  // `useAuth()` returns the client ClientUser shape (not the server Manager
  // union), so isAdminManager() doesn't typecheck here. This gates the remove
  // button visually only — server enforcement is the real boundary.
  const isAdmin = !!user && 'type' in user && user.type === 'admin'

  const filename = data?.filename as string | undefined
  const virtualUrl = data?.url as string | undefined
  const audioUrl =
    virtualUrl || (filename ? `${serverURL}/api/${collectionSlug}/file/${filename}` : null)

  // Drift detection: `duration` is derived on save (read from the saved doc);
  // `frames` are editable live (read from form state, falling back to the doc).
  const duration = data?.duration
  const framesValue = fields?.frames?.value ?? data?.frames
  const framesBeyond = countFramesBeyondDuration(framesValue, duration)

  return (
    <>
      <Upload
        collectionSlug={collectionSlug}
        uploadConfig={{ ...uploadConfig, hideRemoveFile: !isAdmin }}
      />
      {audioUrl && (
        <audio
          key={audioUrl}
          controls
          src={audioUrl}
          style={{ width: '100%', height: '40px', marginTop: 'calc(var(--base) * 0.5)' }}
        >
          Your browser does not support the audio element.
        </audio>
      )}
      {framesBeyond > 0 && typeof duration === 'number' && (
        <Banner type="error">
          {framesBeyond} frame{framesBeyond === 1 ? '' : 's'} fall beyond the audio length (
          {formatSeconds(duration)}). Review the timestamps in the Video tab.
        </Banner>
      )}
    </>
  )
}
