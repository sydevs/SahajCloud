'use client'

import {
  Banner,
  Upload,
  useConfig,
  useDocumentInfo,
  useFormFields,
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
 * Delegates replacement to PayloadCMS's native <Upload>, which renders the
 * dropzone when empty and FileDetails (meta + remove) when a file exists.
 * Replacing audio means removing it first (to reveal the dropzone) then adding a
 * new file, so the remove button must stay visible. Removal-without-replacement
 * and non-admin replacement are blocked server-side by the restrictUploadToAdmin
 * beforeChange hook.
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
  const {
    config: { serverURL },
    getEntityConfig,
  } = useConfig()
  // Subscribe to just `frames` (not all fields) so unrelated keystrokes don't
  // re-render this always-mounted Upload slot.
  const liveFrames = useFormFields(([fields]) => fields?.frames?.value)

  // Hide when live preview is open to maximize space for frame editing
  if (isLivePreviewing) {
    return null
  }

  if (!collectionSlug) return null
  const uploadConfig = getEntityConfig({ collectionSlug })?.upload
  if (!uploadConfig) return null

  const filename = data?.filename as string | undefined
  const virtualUrl = data?.url as string | undefined
  const audioUrl =
    virtualUrl || (filename ? `${serverURL}/api/${collectionSlug}/file/${filename}` : null)

  // Drift detection: `duration` is derived on save (read from the saved doc);
  // `frames` are editable live (read from form state, falling back to the doc).
  const duration = data?.duration
  const framesValue = liveFrames ?? data?.frames
  const framesBeyond = countFramesBeyondDuration(framesValue, duration)

  return (
    <>
      <Upload collectionSlug={collectionSlug} uploadConfig={uploadConfig} />
      {audioUrl && (
        <audio
          key={audioUrl}
          controls
          src={audioUrl}
          style={{ width: '100%', height: '40px', marginTop: 'calc(var(--base) * -0.5)' }}
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
