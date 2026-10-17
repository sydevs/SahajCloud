import type { PayloadRequest, TaskConfig } from 'payload'

import { findMeditationRecording } from '@/collections/Meditations/findMeditationRecording'
import { normalizeLemonfoxResponse } from '@/collections/MeditationTranscripts/lemonfox'
import { findTranscriptRow } from '@/collections/MeditationTranscripts/view'
import {
  lemonfoxApiKey,
  requestLemonfoxTranscript,
  TRANSCRIPTION_UNAVAILABLE_ERROR,
} from '@/jobs/TranscribeMeditation/lemonfox/transcribe'
import type { MeditationTranscript } from '@/payload-types'
import { getR2Url } from '@/plugins/storage'

/**
 * Transcribe one meditation's recording into `meditation-transcripts`.
 *
 * Queued by the transcript row's own afterChange, which also starts the
 * `transcription` queue. That queue's autoRun only picks up a run the start
 * lost.
 *
 * ⚠ **Every write checks the row still names this job's recording.** The audio
 * can be replaced, and transcribed again, while this run waits on Lemonfox. A
 * stale run must not write cues onto the newer request's row.
 *
 * ⚠ **A failure throws, and nothing catches it.** `retries: 0`, so the throw
 * ends the run and the retained job row carries the message — which is where
 * the transcript's `status` and `error` are read from. Catching one into a
 * column would be a second statement of the same failure.
 *
 * ⚠ **No `concurrency` key, on purpose.** Payload holds back every job whose key
 * matches a job still marked `processing`, and a run lost to a restart keeps
 * that flag forever — so a key would block a re-request after a stall, for
 * good. The row checks above stop duplicate writes.
 */
export const TranscribeMeditation: TaskConfig<'transcribeMeditation'> = {
  slug: 'transcribeMeditation',
  label: 'Transcribe Meditation',
  retries: 0,
  inputSchema: [
    { name: 'meditationId', type: 'number', required: true },
    { name: 'audioFilename', type: 'text', required: true },
  ],
  outputSchema: [{ name: 'status', type: 'text', required: true }],
  handler: async ({ input, req }) => {
    const { meditationId, audioFilename } = input

    // Neither read feeds the other, and both have to pass before the vendor
    // call.
    const [row, recording] = await Promise.all([
      findCurrentRow(req, meditationId, audioFilename),
      findMeditationRecording(req, meditationId),
    ])
    // The recording was replaced, which deleted this row. Nothing to write, and
    // nothing wrong: the replacement queued its own run.
    if (!row) return { output: { status: 'superseded' } }
    if (Array.isArray(row.segments) && row.segments.length > 0) {
      return { output: { status: 'completed' } }
    }

    if (recording?.filename !== audioFilename) {
      throw new Error('The recording was replaced while it was being transcribed.')
    }

    const apiKey = lemonfoxApiKey()
    if (!apiKey) throw new Error(TRANSCRIPTION_UNAVAILABLE_ERROR)

    const audioUrl = getR2Url(audioFilename)
    if (!audioUrl) {
      throw new Error('This recording has no public URL, so Lemonfox cannot fetch it.')
    }

    // The normaliser throws on a body carrying no timestamped speech, which is
    // a failed run like any other.
    const segments = normalizeLemonfoxResponse(
      await requestLemonfoxTranscript({ apiKey, audioUrl, locale: recording.locale }),
    )

    if (!(await findCurrentRow(req, meditationId, audioFilename))) {
      return { output: { status: 'superseded' } }
    }

    await req.payload.update({
      collection: 'meditation-transcripts',
      id: row.id,
      data: { provider: 'lemonfox', segments },
      depth: 0,
      overrideAccess: true,
      req,
    })
    return { output: { status: 'completed' } }
  },
}

/**
 * The meditation's transcript row, while it still names `audioFilename`.
 *
 * `meditation` is unique, so there is at most one row per meditation and the
 * recording is a field comparison rather than a second query.
 */
async function findCurrentRow(
  req: PayloadRequest,
  meditationId: number,
  audioFilename: string,
): Promise<MeditationTranscript | undefined> {
  const row = await findTranscriptRow(req, meditationId)
  return row?.audioFilename === audioFilename ? row : undefined
}
