import type { PayloadRequest, TaskConfig } from 'payload'

import { normalizeLemonfoxResponse } from '@/collections/MeditationTranscripts/lemonfox'
import { TRANSCRIPTION_UNAVAILABLE_ERROR } from '@/collections/MeditationTranscripts/requestTranscription'
import { findTranscriptRow } from '@/collections/MeditationTranscripts/view'
import { lemonfoxApiKey, requestLemonfoxTranscript } from '@/lib/lemonfox/transcribe'
import type { MeditationTranscript } from '@/payload-types'
import { getR2Url } from '@/plugins/storage'

/**
 * Transcribe one meditation's recording into `meditation-transcripts`.
 *
 * Queued by `requestTranscription`, which also starts the `transcription`
 * queue. That queue's autoRun only picks up a run the start lost.
 *
 * ⚠ **Every write checks the row still names this job's recording.** The audio
 * can be replaced, and transcribed again, while this run waits on Lemonfox. A
 * stale run must not overwrite the newer request's row.
 *
 * ⚠ **Every failure becomes a `failed` row, and nothing is rethrown.**
 * `retries: 0`, so an escaping throw would leave the row `processing` until the
 * stall bound expires — the state #897 line 10 forbids.
 *
 * ⚠ **No `concurrency` key, on purpose.** Payload holds back every job whose key
 * matches a job still marked `processing`, and a run lost to a restart keeps
 * that flag forever — so a key would block **Try again** after a stall, for
 * good. The writer's dedupe and the row checks above stop duplicate writes.
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

    const row = await findCurrentRow(req, meditationId, audioFilename)
    if (!row) return { output: { status: 'superseded' } }
    if (row.status === 'completed') return { output: { status: 'completed' } }

    // `segments` is deliberately not cleared: the previous recording's text
    // stays readable until this run completes (#897, success line 9).
    await updateRow(req, row.id, { status: 'processing', error: null })

    try {
      // The latest draft, as the endpoints read it: its recording is the one
      // the editor hears.
      const meditation = await req.payload.findByID({
        collection: 'meditations',
        id: meditationId,
        depth: 0,
        draft: true,
        select: { filename: true, locale: true },
        overrideAccess: true,
        req,
      })
      if (meditation.filename !== audioFilename) {
        throw new Error('The recording was replaced while it was being transcribed.')
      }

      const apiKey = lemonfoxApiKey()
      if (!apiKey) throw new Error(TRANSCRIPTION_UNAVAILABLE_ERROR)

      const audioUrl = getR2Url(audioFilename)
      if (!audioUrl) {
        throw new Error('This recording has no public URL, so Lemonfox cannot fetch it.')
      }

      // Inside the try with the vendor call: the normaliser throws on a body
      // carrying no timestamped speech, and that is a failed transcript rather
      // than a crashed job.
      const segments = normalizeLemonfoxResponse(
        await requestLemonfoxTranscript({ apiKey, audioUrl, locale: meditation.locale }),
      )

      if (!(await findCurrentRow(req, meditationId, audioFilename))) {
        return { output: { status: 'superseded' } }
      }
      await updateRow(req, row.id, {
        status: 'completed',
        provider: 'lemonfox',
        segments,
        outdated: false,
        error: null,
      })
      return { output: { status: 'completed' } }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Never report over a finished transcript: a second run for this same
      // recording (a stalled row accepts a fresh request) may have completed
      // while this one was failing, and its text outranks this error.
      const current = await findCurrentRow(req, meditationId, audioFilename)
      if (current && current.status !== 'completed') {
        await updateRow(req, row.id, { status: 'failed', error: message })
      }
      return { output: { status: 'failed' } }
    }
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

async function updateRow(
  req: PayloadRequest,
  id: number,
  data: Partial<Omit<MeditationTranscript, 'id' | 'meditation' | 'createdAt' | 'updatedAt'>>,
): Promise<void> {
  await req.payload.update({
    collection: 'meditation-transcripts',
    id,
    data,
    depth: 0,
    overrideAccess: true,
    req,
  })
}
