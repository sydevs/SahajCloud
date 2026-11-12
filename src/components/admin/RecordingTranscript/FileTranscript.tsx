'use client'

import type { StaticDescription } from 'payload'

import {
  FieldDescription,
  FieldLabel,
  useDocumentInfo,
  useField,
  useFieldPath,
  useLocale,
} from '@payloadcms/ui'
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
  under = false,
}: {
  file: TranscribedFile
  /**
   * Shown under another document's upload field rather than on the file's own
   * page: folded closed, since a Path Step carries one per panel video, and
   * with no language control — the language is corrected on the file, for
   * every page using it.
   */
  under?: boolean
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
        collapsible={under}
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
      {!under && row && phase !== 'pending' && (
        <div className={styles.language}>
          <SpokenLanguage language={row.language} request={request} requesting={requesting} />
        </div>
      )}
    </>
  )
}

/**
 * A file's Transcript, registered in two places (#1016):
 *
 * - **On the file's own page**, as a `ui` field: the one place its spoken
 *   language is corrected.
 * - **Under an upload field holding the file**, as that field's `Description`
 *   — the one slot Payload renders after an upload field's description, which
 *   it replaces — so it renders the description first, and the transcript
 *   reads as part of the field. A Path Step's intro audio and panel media.
 *
 * Read-only there, and never stored on the step: the transcript is the file's.
 */
export function FileTranscriptField({
  field,
  path,
}: {
  field?: { type?: string; admin?: { description?: unknown } }
  path?: string
}) {
  const under = field?.type === 'upload'
  const fieldPath = useFieldPath() || path || ''
  const file = useShownFile(under, fieldPath)
  const panel =
    file && transcribableMedia(file.mimeType) ? (
      // Keyed, so a swapped file starts its player and playhead afresh.
      <FileTranscript file={file} key={file.id} under={under} />
    ) : null

  if (under) {
    return (
      <>
        <FieldDescription
          description={field?.admin?.description as StaticDescription | undefined}
          path={fieldPath}
        />
        {panel && <div style={{ marginTop: 'calc(var(--base) * 0.75)' }}>{panel}</div>}
      </>
    )
  }
  if (!panel) return null
  return (
    <div className="field-type" style={{ marginBottom: 'var(--spacing-field)' }}>
      <FieldLabel label="Transcript" path={fieldPath} />
      {panel}
    </div>
  )
}

/**
 * The file the panel shows: the one an upload field holds, read by id — or,
 * on the file's own page, the saved document itself.
 */
function useShownFile(under: boolean, path: string): TranscribedFile | undefined {
  const { data, id } = useDocumentInfo()
  const { value } = useField<unknown>({ path })
  const { code } = useLocale()
  const { data: list } = useSWR(
    under ? fileUrl(relationId(value), code) : null,
    payloadListFetcher<File>,
    { revalidateOnFocus: false },
  )
  if (under) return list?.docs?.[0]
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
