'use client'

import type { UIFieldClientComponent } from 'payload'

import { useDocumentInfo } from '@payloadcms/ui'
import React from 'react'

import { useLivePreviewPlayback } from './playback'
import { RecordingTranscript } from './RecordingTranscript'
import { useRecordingTranscript } from './useRecordingTranscript'

/**
 * A meditation's Transcript tab. It reads along with the live preview, which
 * is the meditation's player — so, unlike a file's panel, it brings none.
 */
export const MeditationTranscriptField: UIFieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const transcript = useRecordingTranscript('meditations', id)
  const playback = useLivePreviewPlayback()
  return <RecordingTranscript playback={playback} transcript={transcript} />
}

export default MeditationTranscriptField
