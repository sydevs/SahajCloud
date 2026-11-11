import type { Payload } from 'payload'

import { createLocalReq } from 'payload'

import { transcribableMedia } from '@/lib/transcripts/media'
import { syncRecordingTranscript } from '@/lib/transcripts/sync'

/**
 * Start a video file's transcript once Cloudflare Stream reports it ready —
 * the counterpart of `syncFileTranscript`, which starts an MP3's on save.
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
