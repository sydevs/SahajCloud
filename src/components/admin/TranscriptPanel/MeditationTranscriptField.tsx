'use client'

import type { UIFieldClientComponent } from 'payload'

import { useDocumentInfo } from '@payloadcms/ui'
import React from 'react'

import { useLivePreviewPlayback } from './playback'
import { TranscriptPanel } from './TranscriptPanel'
import { useTranscript } from './useTranscript'

/**
 * A meditation's Transcript tab. It reads along with the live preview, which
 * is the meditation's player — so, unlike a file's panel, it brings none.
 *
 * The filename and language are the **saved** document's (`useDocumentInfo`),
 * as `AudioUpload` reads them on this collection, because the endpoint reads
 * the stored meditation too.
 */
export const MeditationTranscriptField: UIFieldClientComponent = () => {
  const { data, id } = useDocumentInfo()
  const transcript = useTranscript('meditations', id)
  const playback = useLivePreviewPlayback()
  return (
    <TranscriptPanel
      filename={data?.filename as string | null | undefined}
      playback={playback}
      recordingLocale={data?.locale}
      transcript={transcript}
    />
  )
}

export default MeditationTranscriptField
