'use client'

import type { UIFieldClientProps } from 'payload'

import { FieldLabel, useDocumentInfo, useFieldPath, useFormFields, useLocale } from '@payloadcms/ui'
import React from 'react'
import useSWR from 'swr'

import { payloadListFetcher } from '@/components/admin/helpers/payloadListFetcher'
import { transcribableMedia } from '@/lib/transcripts/media'
import { relationId } from '@/lib/utilities/relationId'
import type { File } from '@/payload-types'

import { useMediaPlayback } from './playback'
import { RecordingTranscript } from './RecordingTranscript'
import styles from './RecordingTranscript.module.css'
import { SpokenLanguage } from './SpokenLanguage'
import { fileUrl } from './transcriptModel'
import { useRecordingTranscript } from './useRecordingTranscript'

/** What the panel reads off a file: enough to play it and to name it. */
export type TranscribedFile = Pick<File, 'filename' | 'mimeType' | 'mp4Url' | 'url'> & {
  id: number | string
}

/**
 * An audio or video file's transcript, framed with a player to read along
 * with. Clicking a phrase plays the file from it, and the playing phrase
 * follows the player either way.
 */
export function FileTranscript({
  file,
  ownPage = false,
}: {
  file: TranscribedFile
  /**
   * On the file's own page: open, and with the language control. Anywhere else
   * the file is used it is folded closed, since a Path Step carries one per
   * panel video, and the language is corrected on the file, for every page
   * using it.
   */
  ownPage?: boolean
}) {
  const transcript = useRecordingTranscript('files', file.id)
  const { mediaRef, playback } = useMediaPlayback()
  const kind = transcribableMedia(file.mimeType)
  // A video plays from its Stream MP4, which answers 404 until Stream has made
  // it — and only a run still in flight is waiting on that
  // (`waitForVideoDownload`). A failed run still leaves an editor something to
  // listen to. An audio file is its own R2 object from the moment it is saved.
  const waiting = transcript.phase === 'pending'
  const src = kind === 'audio' ? file.url : kind === 'video' && !waiting ? file.mp4Url : null
  const { phase, request, requesting, row } = transcript

  return (
    <>
      <RecordingTranscript
        collapsible={!ownPage}
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
      {/* Below what it describes: a correction, not the first thing to read. */}
      {ownPage && row && phase !== 'pending' && (
        <div className={styles.language}>
          <SpokenLanguage language={row.language} request={request} requesting={requesting} />
        </div>
      )}
    </>
  )
}

/**
 * A file's Transcript, as a `ui` field (#1016).
 *
 * - **With no `fileField`**, the edited document is the file: its own page,
 *   and the one place its spoken language is corrected.
 * - **With a `fileField`**, it shows the file the named sibling upload field
 *   holds, folded closed beneath it — a Path Step's intro audio and panel
 *   media. Read-only there, and never stored on the step: the transcript is
 *   the file's, and a retry serves every step using it.
 *
 * Nothing renders for a file with no transcript to have, or none chosen.
 */
export function FileTranscriptField({
  fileField,
  path,
}: UIFieldClientProps & { fileField?: string }) {
  const fieldPath = useFieldPath() || path
  // A sibling's path: `panels.0.mediaTranscript` reads `panels.0.media`.
  const file = useShownFile(fileField ? fieldPath.replace(/[^.]+$/, fileField) : null)
  if (!file || !transcribableMedia(file.mimeType)) return null

  return (
    <div className="field-type" style={{ marginBottom: 'var(--spacing-field)' }}>
      {!fileField && <FieldLabel label="Transcript" path={fieldPath} />}
      {/* Keyed, so a swapped file starts its player and playhead afresh. */}
      <FileTranscript file={file} key={file.id} ownPage={!fileField} />
    </div>
  )
}

/**
 * The file the panel shows: the one an upload field at `uploadPath` holds,
 * read by id — or, with none, the saved document itself.
 */
function useShownFile(uploadPath: string | null): TranscribedFile | undefined {
  const { data, id } = useDocumentInfo()
  const value = useFormFields(([fields]) => (uploadPath ? fields[uploadPath]?.value : undefined))
  const { code } = useLocale()
  const { data: list } = useSWR(
    uploadPath ? fileUrl(relationId(value), code) : null,
    payloadListFetcher<File>,
    { revalidateOnFocus: false },
  )
  if (uploadPath) return list?.docs?.[0]
  if (!id) return undefined
  return {
    filename: data?.filename as string | null | undefined,
    id,
    mimeType: data?.mimeType as string | null | undefined,
    mp4Url: data?.mp4Url as string | null | undefined,
    url: data?.url as string | null | undefined,
  }
}

export default FileTranscriptField
