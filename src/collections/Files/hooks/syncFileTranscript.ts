import type { CollectionAfterChangeHook } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import type { TranscriptSegment } from '@/lib/meditations/transcript'
import { transcribableMedia } from '@/lib/transcripts/media'
import { syncRecordingTranscript } from '@/lib/transcripts/sync'

/**
 * `req.context.importedTranscript`: cues that already exist for the file being
 * uploaded, in a known language. The Storyblok seed passes a Path Step's
 * hand-made subtitles this way, so the upload stores them rather than paying
 * for a run (`seeds/storyblok/import.ts`). Unreachable over REST, where Payload
 * hard-codes an empty `context`.
 */
export type ImportedTranscript = { language: LocaleCode; segments: TranscriptSegment[] }

/**
 * afterChange: an MP3 is transcribed as soon as it is saved, and again when it
 * is replaced (`syncRecordingTranscript`), so its transcript is usually ready
 * by the time an editor attaches it (#1016).
 *
 * **A video is not transcribed here.** It is a Cloudflare Stream upload whose
 * MP4 — the only form the vendor can fetch — exists only after Stream has
 * processed it, so its transcript starts from Stream's `ready` webhook instead
 * (`transcribeStreamVideo`).
 *
 * The language is left empty for the run to detect: a file has none of its
 * own, and the admin locale it was uploaded under says nothing about it.
 */
export const syncFileTranscript: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (transcribableMedia(doc.mimeType) !== 'audio') return doc
  const audioFilename = doc.filename
  if (!audioFilename || previousDoc?.filename === audioFilename) return doc

  const imported = req.context?.importedTranscript as ImportedTranscript | undefined
  await syncRecordingTranscript(req, {
    source: { relationTo: 'files', value: Number(doc.id) },
    audioFilename,
    language: imported?.language ?? null,
    importedSegments: imported?.segments,
  })

  return doc
}
