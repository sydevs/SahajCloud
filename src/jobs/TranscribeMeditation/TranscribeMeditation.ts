import type { PayloadRequest, TaskConfig } from 'payload'

import { findTranscriptRow } from '@/collections/MeditationTranscripts/view'
import { serverEnv } from '@/lib/env'
import type { TranscriptProvider } from '@/lib/meditations/transcript'
import type { MeditationTranscript } from '@/payload-types'
import { getR2Url } from '@/plugins/storage'
import { isProductionDeployment } from '@/plugins/storage/previewIsolation'

import { lemonfoxLanguage, normalizeLemonfoxResponse, requestLemonfoxTranscript } from './lemonfox'
import { sampleLemonfoxResponse } from './sampleResponse'

/**
 * Transcribe one meditation's recording into `meditation-transcripts`.
 *
 * Queued by `POST /api/meditations/:id/transcript`, which also starts the
 * `transcription` queue at once. The queue's 15-minute autoRun only picks up a
 * run that start lost.
 *
 * ⚠ **Every write checks the row still names this job's recording.** The audio
 * can be replaced, and transcribed again, while this run waits on Lemonfox. A
 * stale run must not overwrite the newer request's row.
 *
 * A failure is written to the row for the editor to read, then rethrown so the
 * job keeps its error. `retries: 0`, because the editor's **Try again** is the
 * retry.
 *
 * ⚠ **No `concurrency` key, on purpose.** Payload holds back every job whose key
 * matches a job still marked `processing`, and a run lost to a restart keeps
 * that flag forever — so a key would block **Try again** after a stall, for
 * good. The endpoint's dedupe and the row checks above stop duplicate writes.
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

    await updateRow(req, row.id, { status: 'processing', error: null })

    try {
      // The latest draft, as the endpoint reads it: its recording is the one
      // the editor hears.
      const meditation = await req.payload.findByID({
        collection: 'meditations',
        id: meditationId,
        depth: 0,
        draft: true,
        select: { filename: true, locale: true, duration: true },
        overrideAccess: true,
        req,
      })
      if (meditation.filename !== audioFilename) {
        throw new Error('The recording was replaced while it was being transcribed.')
      }

      const language = lemonfoxLanguage(meditation.locale ?? 'en')
      const { provider, response } = await transcribe({
        audioFilename,
        language,
        duration: meditation.duration,
      })
      const segments = normalizeLemonfoxResponse(response)

      if (!(await findCurrentRow(req, meditationId, audioFilename))) {
        return { output: { status: 'superseded' } }
      }
      await updateRow(req, row.id, {
        status: 'completed',
        provider,
        language: language ?? null,
        segments,
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
      throw error
    }
  },
}

async function transcribe({
  audioFilename,
  language,
  duration,
}: {
  audioFilename: string
  language?: string
  duration?: number | null
}): Promise<{ provider: TranscriptProvider; response: unknown }> {
  const apiKey = serverEnv.LEMONFOX_API_KEY
  if (!apiKey) {
    if (isProductionDeployment()) {
      throw new Error('Transcription is not configured: LEMONFOX_API_KEY is not set.')
    }
    return { provider: 'sample', response: sampleLemonfoxResponse(duration) }
  }

  const audioUrl = getR2Url(audioFilename)
  if (!audioUrl) {
    throw new Error('This recording has no public URL, so Lemonfox cannot fetch it.')
  }
  return {
    provider: 'lemonfox',
    response: await requestLemonfoxTranscript({ apiKey, audioUrl, language }),
  }
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
