'use client'

import type { FieldClientComponent } from 'payload'

import { useLivePreviewContext } from '@payloadcms/ui'
import { useEffect } from 'react'

/**
 * Opens the live preview panel on mount, and renders nothing.
 *
 * Mounted on `previewEvent` rather than existing as a `ui` field, because that
 * field's value is what the preview actually needs: Payload posts the
 * document's form state into the iframe (`payload-live-preview`), and
 * `previewEvent` carries the merged event in that payload — the Atlas widget
 * can't fetch a submission back (create-only for API clients, and a new-event
 * submission has no Event id). Keeping the arming and the data on one field
 * means the preview can't be opened on a document that has nothing to show it.
 *
 * A reviewer is here to judge how a listing would look, so the panel is open by
 * default rather than a click away. `isLivePreviewEnabled` guards the case
 * where a document has no preview URL yet (an unsaved submission).
 */
export const EventPreviewMount: FieldClientComponent = () => {
  const { isLivePreviewEnabled, isLivePreviewing, setIsLivePreviewing } = useLivePreviewContext()

  useEffect(() => {
    if (isLivePreviewEnabled && !isLivePreviewing) setIsLivePreviewing(true)
    // Runs once on mount: re-running when `isLivePreviewing` changes would
    // re-open the panel the moment a reviewer deliberately closed it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLivePreviewEnabled])

  return null
}

export default EventPreviewMount
