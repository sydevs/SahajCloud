import type { CollectionAfterChangeHook, Payload, PayloadRequest } from 'payload'

import { createLocalReq } from 'payload'

import { isValidLocale, type LocaleCode } from '@/lib/locales'
import type { TranscriptSegment } from '@/lib/transcripts/schema'

import { type RecordingCollection, transcribableMedia } from './media'
import { findTranscript, type TranscriptSource } from './read'

/**
 * `req.context.importedTranscript`: cues that already exist for the recording
 * being uploaded, in a known language. The Storyblok seed passes a Path Step's
 * hand-made subtitles this way, so the upload stores them rather than paying
 * for a run (`seeds/storyblok/import.ts`). Unreachable over REST, where Payload
 * hard-codes an empty `context`.
 */
export type ImportedTranscript = { language: LocaleCode; segments: TranscriptSegment[] }

/**
 * Make the recording's transcript row follow its current file, and nothing else.
 *
 * #897's 2026-10-12 Decision — transcribed "by itself when a recording is
 * added". A **replacement** deletes the old row before creating the new one:
 * cues produced from a recording nobody can hear any more are misleading, not
 * history (review, #968).
 *
 * It creates and deletes a row; queueing the run belongs to the transcript's own
 * afterChange (`queueTranscription`), so a row cannot exist without a request
 * behind it. Called with the caller's `req`, so the row commits or rolls back
 * with the save that added the recording.
 *
 * `language` is `null` where nobody knows it yet — a file, whose language the
 * run detects (#1016) — and the meditation's own `locale` otherwise.
 *
 * `importedSegments` are cues that already exist for the recording. A row
 * created with cues queues no run (`queueTranscription`), so the vendor is not
 * paid to redo them.
 */
export async function syncRecordingTranscript(
  req: PayloadRequest,
  {
    source,
    audioFilename,
    language,
    importedSegments,
  }: {
    source: TranscriptSource
    audioFilename: string
    language: LocaleCode | null
    importedSegments?: TranscriptSegment[]
  },
): Promise<void> {
  const existing = await findTranscript(req, source)
  if (existing) {
    if (existing.audioFilename === audioFilename) return
    await req.payload.delete({
      collection: 'transcripts',
      id: existing.id,
      overrideAccess: true,
      req,
    })
  }

  await req.payload.create({
    collection: 'transcripts',
    data: importedSegments?.length
      ? { source, audioFilename, language, provider: 'imported', segments: importedSegments }
      : { source, audioFilename, language },
    depth: 0,
    overrideAccess: true,
    req,
  })
}

/**
 * afterChange for a collection of recordings: an audio upload is transcribed
 * as soon as it is saved, and again when it is replaced, so its transcript is
 * usually ready by the time anyone reads it.
 *
 * **A video is not transcribed here.** It is a Cloudflare Stream upload whose
 * MP4 — the only form the vendor can fetch — exists only after Stream has
 * processed it, so its transcript starts from Stream's `ready` webhook instead
 * (`transcribeStreamVideo`, below).
 *
 * The language is the recording's own `locale` where it has one — a meditation
 * is one language — and left empty otherwise, for the run to detect: a file has
 * none, and the admin locale it was uploaded under says nothing about it.
 */
export const syncTranscriptOnSave =
  (relationTo: RecordingCollection): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, req }) => {
    if (transcribableMedia(doc.mimeType) !== 'audio') return doc
    const audioFilename = doc.filename
    if (!audioFilename || previousDoc?.filename === audioFilename) return doc

    const imported = req.context?.importedTranscript as ImportedTranscript | undefined
    const ownLanguage: unknown = doc.locale
    await syncRecordingTranscript(req, {
      source: { relationTo, value: Number(doc.id) },
      audioFilename,
      language:
        imported?.language ??
        (typeof ownLanguage === 'string' && isValidLocale(ownLanguage) ? ownLanguage : null),
      importedSegments: imported?.segments,
    })
    return doc
  }

/**
 * Start a video file's transcript once Cloudflare Stream reports it ready —
 * the counterpart of `syncTranscriptOnSave`, which starts an MP3's on save.
 *
 * Called by the Stream webhook after it enables downloads, so the MP4 the run
 * fetches is on its way (the run still waits for it: `TranscribeRecording`).
 * A `videos` upload shares the account and the webhook, and finds no `files`
 * row here, which is the answer wanted.
 *
 * Idempotent, because Cloudflare may deliver `ready` more than once:
 * `syncRecordingTranscript` leaves a row naming this filename alone.
 */
export async function transcribeStreamVideo(payload: Payload, uid: string): Promise<void> {
  const { docs } = await payload.find({
    collection: 'files',
    where: { filename: { equals: uid } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    select: { filename: true, mimeType: true },
  })
  const file = docs[0]
  if (!file?.filename || transcribableMedia(file.mimeType) !== 'video') return

  await syncRecordingTranscript(await createLocalReq({}, payload), {
    source: { relationTo: 'files', value: file.id },
    audioFilename: file.filename,
    language: null,
  })
}
