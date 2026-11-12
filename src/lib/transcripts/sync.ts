import type { CollectionAfterChangeHook, Payload, PayloadRequest } from 'payload'

import { createLocalReq } from 'payload'

import type { TranscriptSegment } from '@/lib/transcripts/schema'

import { type RecordingCollection, transcribableMedia } from './media'
import { findTranscript, type TranscriptSource, whereSource } from './read'

/**
 * The `req.context` key a run sets when it writes the language it detected
 * back to a file that stated none (`TranscribeRecording`). The save hook below
 * reads it as "not a correction": re-running there would pay for the same
 * transcript twice.
 */
export const LANGUAGE_DETECTED = 'transcriptLanguageDetected'

/**
 * Give the recording a fresh transcript row for its current file, deleting the
 * one it had. Cues produced from a recording nobody can hear any more, or in a
 * language it is not spoken in, are misleading, not history (review, #968).
 *
 * It creates and deletes a row; queueing the run belongs to the transcript's own
 * afterChange (`queueTranscription`), so a row cannot exist without a request
 * behind it. `segments` are cues that already exist for the recording, and a
 * row created with them queues nothing, so the vendor is not paid to redo them.
 *
 * Runs on the caller's `req`, so the row commits or rolls back with whatever
 * asked for it.
 *
 * ⚠ **The delete is by `where`, and its `errors` are read.** A request that loses
 * a race finds the row already gone, and a delete by id would answer that with a
 * 404 that reads as a missing recording. But a delete by `where` collects a
 * row's failure rather than throwing it, so unread, a row that refused to go
 * would fall through to the create and trip the unique index on `source` — and
 * be reported as a race, with the real cause logged nowhere.
 */
export async function replaceTranscript(
  req: PayloadRequest,
  source: TranscriptSource,
  { audioFilename, segments }: { audioFilename: string; segments?: TranscriptSegment[] },
): Promise<number> {
  const { errors } = await req.payload.delete({
    collection: 'transcripts',
    where: whereSource(source),
    overrideAccess: true,
    req,
  })
  if (errors.length > 0) {
    throw new Error(
      `the previous transcript could not be deleted: ${errors[0]?.message ?? 'no reason given'}`,
    )
  }

  const created = await req.payload.create({
    collection: 'transcripts',
    data: segments?.length
      ? { source, audioFilename, provider: 'imported', segments }
      : { source, audioFilename },
    depth: 0,
    overrideAccess: true,
    req,
  })
  return created.id
}

/**
 * afterChange for a collection of recordings: a recording is transcribed when
 * it is added, and again when its file or its language changes, so its
 * transcript is usually ready by the time anyone reads it and is always in the
 * language the recording says it is in (#897's 2026-10-12 Decision —
 * transcribed "by itself when a recording is added").
 *
 * `languageField` is where the recording states that language: a meditation's
 * `locale`, a file's `spokenLanguage` (#1016). The run reads it from there.
 *
 * **A video's first run does not start here.** It is a Cloudflare Stream
 * upload whose MP4 — the only form the vendor can fetch — exists only after
 * Stream has processed it, so it starts from Stream's `ready` webhook instead
 * (`transcribeStreamVideo`, below). A language change re-runs one that has
 * already started; a video with no run yet is left to the panel's own
 * Transcribe (`useRetryTranscript`), because a run queued while Stream is still
 * preparing the MP4 would burn its wait and then leave the webhook nothing to
 * start — a row naming the filename is a row `transcribeStreamVideo` skips.
 *
 * **A change supersedes a run in flight**, as a replaced recording always has:
 * the run's cues would be in a language the recording no longer claims. Only
 * the transcribe endpoint, which one click reaches, bounds a run by its cost.
 *
 * `req.context.importedSegments`: cues that already exist for the recording
 * being uploaded. The Storyblok seed passes a Path Step's hand-made subtitles
 * this way, with the file's `spokenLanguage`, so the upload stores them rather
 * than paying for a run (`seeds/storyblok/import.ts`). Unreachable over REST,
 * where Payload hard-codes an empty `context`.
 */
export const syncTranscriptOnSave =
  (
    relationTo: RecordingCollection,
    languageField: 'locale' | 'spokenLanguage',
  ): CollectionAfterChangeHook =>
  async ({ context, doc, previousDoc, req }) => {
    const media = transcribableMedia(doc.mimeType)
    const audioFilename = doc.filename
    if (!media || !audioFilename) return doc

    const source = { relationTo, value: Number(doc.id) }
    const fileChanged = previousDoc?.filename !== audioFilename
    const languageChanged =
      !context[LANGUAGE_DETECTED] &&
      (previousDoc?.[languageField] ?? null) !== (doc[languageField] ?? null)

    const transcribe =
      media === 'audio'
        ? fileChanged || languageChanged
        : !fileChanged && languageChanged && (await findTranscript(req, source)) !== undefined
    if (!transcribe) return doc

    await replaceTranscript(req, source, {
      audioFilename,
      segments: context.importedSegments as TranscriptSegment[] | undefined,
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
 * Idempotent, because Cloudflare may deliver `ready` more than once: a row
 * already naming this filename is left alone.
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

  const req = await createLocalReq({}, payload)
  const source = { relationTo: 'files', value: file.id } as const
  if ((await findTranscript(req, source))?.audioFilename === file.filename) return
  await replaceTranscript(req, source, { audioFilename: file.filename })
}
