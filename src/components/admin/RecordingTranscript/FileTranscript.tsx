'use client'

import type { UIFieldClientComponent } from 'payload'

import { FieldLabel, useDocumentInfo } from '@payloadcms/ui'
import React from 'react'

import { transcribableMedia } from '@/lib/transcripts/media'
import type { File } from '@/payload-types'

import { useMediaPlayback } from './playback'
import { RecordingTranscript } from './RecordingTranscript'
import styles from './RecordingTranscript.module.css'
import { SpokenLanguage } from './SpokenLanguage'
import { type RecordingTranscriptState, useRecordingTranscript } from './useRecordingTranscript'

/** What the panel reads off a file: enough to play it and to name it. */
export type TranscribedFile = Pick<File, 'filename' | 'mimeType' | 'mp4Url' | 'url'> & {
  id: number | string
}

/**
 * An audio or video file's transcript, framed with a player to read along
 * with: on the file's own page, and under an upload field using the file
 * (`UploadTranscript`). Clicking a phrase plays the file from it, and the
 * playing phrase follows the player either way.
 */
export function FileTranscript({
  file,
  transcript,
  collapsible = false,
}: {
  file: TranscribedFile
  transcript: RecordingTranscriptState
  /** Closed behind a header, under a field of a longer form. */
  collapsible?: boolean
}) {
  const { mediaRef, playback } = useMediaPlayback()
  const kind = transcribableMedia(file.mimeType)
  // A video plays from its Stream MP4, whose address answers 404 until Stream
  // has made it. Cues are not that answer: a run that failed after the
  // download was made leaves the editor reading "Try again" with nothing to
  // listen to. Only a run still in flight is waiting on the MP4 itself
  // (`waitForVideoDownload`). An audio file is its own R2 object from the
  // moment it is saved.
  const waiting = transcript.phase === 'pending'
  const src = kind === 'audio' ? file.url : kind === 'video' && !waiting ? file.mp4Url : null

  return (
    <RecordingTranscript
      collapsible={collapsible}
      filename={file.filename}
      playback={playback}
      player={
        src &&
        (kind === 'video' ? (
          <video controls preload="metadata" ref={mediaRef} src={src} />
        ) : (
          <audio controls preload="metadata" ref={mediaRef} src={src} />
        ))
      }
      transcript={transcript}
    />
  )
}

/**
 * The Transcript panel on an audio or video file's own edit view, and the one
 * place a file's spoken language is corrected — for every page using the file.
 */
export const FileTranscriptField: UIFieldClientComponent = ({ path }) => {
  const { data, id } = useDocumentInfo()
  const transcript = useRecordingTranscript('files', id)
  if (!id) return null
  const file: TranscribedFile = {
    filename: data?.filename as string | null | undefined,
    id,
    mimeType: data?.mimeType as string | null | undefined,
    mp4Url: data?.mp4Url as string | null | undefined,
    url: data?.url as string | null | undefined,
  }
  const { phase, refresh, row } = transcript
  return (
    <div className="field-type" style={{ marginBottom: 'var(--spacing-field)' }}>
      <FieldLabel label="Transcript" path={path} />
      <FileTranscript file={file} transcript={transcript} />
      {/* Below what it describes: a correction, not the first thing to read. */}
      {row && phase !== 'pending' && (
        <div className={styles.language}>
          <SpokenLanguage fileId={id} language={row.language} onChanged={refresh} />
        </div>
      )}
    </div>
  )
}

export default FileTranscriptField
