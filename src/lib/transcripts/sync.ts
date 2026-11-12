import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'

import { isValidLocale, type LocaleCode } from '@/lib/locales'
import type { TranscriptSegment } from '@/lib/transcripts/schema'
import type { Transcript } from '@/payload-types'

import { type RecordingCollection, transcribableMedia } from './media'

/** A recording a transcript can belong to: its own upload row. */
export type TranscriptSource = { relationTo: RecordingCollection; value: number }

/**
 * `req.context.importedTranscript`: cues that already exist for the recording
 * being uploaded, in a known language. The Storyblok seed passes a Path Step's
 * hand-made subtitles this way, so the upload stores them rather than paying
 * for a run (`seeds/storyblok/import.ts`). Unreachable over REST, where Payload
 * hard-codes an empty `context`.
 */
export type ImportedTranscript = { language: LocaleCode; segments: TranscriptSegment[] }

/**
 * The recording's transcript row. `source` is unique, so there is at most one.
 *
 * ⚠ **No `select`, because the row has to arrive whole.** `status` is virtual,
 * computed by its own `afterRead` from `segmentCount` and `job`
 * (`Transcripts.ts`), so a `select` would starve that hook and every row would
 * read `completed`.
 */
export async function findTranscript(
  req: PayloadRequest,
  source: TranscriptSource,
): Promise<Transcript | undefined> {
  const { docs } = await req.payload.find({
    collection: 'transcripts',
    where: { source: { equals: source } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs[0]
}

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
 * (`transcribeStreamVideo`).
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
