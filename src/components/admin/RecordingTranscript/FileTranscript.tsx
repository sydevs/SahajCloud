'use client'

import type { UIFieldClientComponent } from 'payload'

import { FieldLabel, useDocumentInfo, useLocale } from '@payloadcms/ui'
import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { baseLanguage, getLocaleLabel, isValidLocale, type LocaleCode } from '@/lib/locales'
import { transcribableMedia } from '@/lib/transcripts/media'
import type { File } from '@/payload-types'

import { useMediaPlayback } from './playback'
import { RecordingTranscript } from './RecordingTranscript'
import styles from './RecordingTranscript.module.css'
import { SpokenLanguage } from './SpokenLanguage'
import { useRecordingTranscript } from './useRecordingTranscript'

/** What the panel reads off a file: enough to play it and to name it. */
export type TranscribedFile = Pick<File, 'filename' | 'mimeType' | 'mp4Url' | 'url'> & {
  id: number | string
}

/**
 * An audio or video file's transcript with a player to read along with: the
 * file's own Transcript panel, and the same panel on a Path Step using the
 * file (`FileTranscriptPreview`). Clicking a phrase plays the file from it,
 * and the playing phrase follows the player either way.
 */
export function FileRecordingTranscript({
  file,
  label,
  path,
  checkLanguage = false,
}: {
  file: TranscribedFile
  label: string
  path?: string
  /**
   * Warn when the recording is in another language than the one being edited.
   * True for a step's intro audio, which is narrated per language; false for a
   * panel video, which may be shown to every language as it is.
   */
  checkLanguage?: boolean
}) {
  const transcript = useRecordingTranscript('files', file.id)
  const { mediaRef, playback } = useMediaPlayback()
  const { code } = useLocale()
  const { phase, refresh, row } = transcript
  const kind = transcribableMedia(file.mimeType)
  const hasCues = (row?.segments?.length ?? 0) > 0
  // A video plays from its Stream MP4, which exists only once Stream has made
  // it — and its transcript waited for exactly that, so the cues say it does.
  // An audio file is its own R2 object from the moment it is saved.
  const src = kind === 'audio' ? file.url : kind === 'video' && hasCues ? file.mp4Url : null

  const language = isValidLocale(row?.language ?? '') ? (row?.language as LocaleCode) : null
  const mismatch =
    checkLanguage &&
    phase === 'completed' &&
    language !== null &&
    isValidLocale(code ?? '') &&
    baseLanguage(language) !== baseLanguage(code as LocaleCode)

  return (
    <div className="field-type" style={{ marginBottom: 'var(--spacing-field)' }}>
      <FieldLabel label={label} path={path} />
      <RecordingTranscript
        filename={file.filename}
        playback={playback}
        scrollable
        transcript={transcript}
      >
        {mismatch && (
          <InfoBanner type="warning">
            This recording is in {getLocaleLabel(language)}, but you are editing{' '}
            {getLocaleLabel(code as LocaleCode)}.
          </InfoBanner>
        )}
        {src &&
          (kind === 'video' ? (
            <video className={styles.player} controls preload="metadata" ref={mediaRef} src={src} />
          ) : (
            <audio className={styles.player} controls preload="metadata" ref={mediaRef} src={src} />
          ))}
      </RecordingTranscript>
      {/* Below what it describes: a correction, not the first thing to read. */}
      {row && phase !== 'pending' && (
        <div className={styles.language}>
          <SpokenLanguage fileId={file.id} language={row.language} onChanged={refresh} />
        </div>
      )}
    </div>
  )
}

/** The Transcript panel on an audio or video file's own edit view. */
export const FileTranscript: UIFieldClientComponent = ({ path }) => {
  const { data, id } = useDocumentInfo()
  if (!id) return null
  const file: TranscribedFile = {
    filename: data?.filename as string | null | undefined,
    id,
    mimeType: data?.mimeType as string | null | undefined,
    mp4Url: data?.mp4Url as string | null | undefined,
    url: data?.url as string | null | undefined,
  }
  return <FileRecordingTranscript file={file} label="Transcript" path={path} />
}

export default FileTranscript
