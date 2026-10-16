import type { PayloadRequest } from 'payload'

import { runQueueSoon } from '@/lib/jobs/runQueueSoon'
import { lemonfoxApiKey } from '@/lib/lemonfox/transcribe'
import type { MeditationTranscript } from '@/payload-types'

import { findTranscriptRow, isTranscriptionActive } from './view'

/**
 * What the Transcript tab reads when transcription is not configured.
 *
 * A `failed` row rather than a queued job: queueing one certain to fail is
 * dishonest latency, and on an environment with no key every upload would queue
 * a doomed job. Shared with the task, so both paths say the same thing.
 */
export const TRANSCRIPTION_UNAVAILABLE_ERROR =
  'Transcription is unavailable: this deployment has no Lemonfox API key.'

/**
 * Ask for a transcript of one recording, and start the queue.
 *
 * The one writer of a transcription request. Both callers — the `meditations`
 * afterChange hook that transcribes a new recording, and
 * `POST /api/meditations/:id/transcript` behind **Transcribe** and **Try
 * again** — go through here, so a request means the same thing either way.
 *
 * ⚠ **`segments`, `provider` and `language` survive a request.** `audioFilename`
 * names the recording this request is for; `segments` holds the last *completed*
 * transcript's cues, which stay readable across a replacement and a redo until
 * a new run completes (#897, success line 9).
 */
export async function requestTranscription({
  req,
  meditationId,
  audioFilename,
  language,
  delayMs,
}: {
  req: PayloadRequest
  meditationId: number
  audioFilename: string
  /** The meditation's own `locale`. Required on the row, and what the glossary keys on. */
  language: MeditationTranscript['language']
  /**
   * `2000` from a hook, whose job row joins the caller's transaction and cannot
   * run before it commits. `0` from the endpoint, which is wrapped in none.
   */
  delayMs: number
}): Promise<MeditationTranscript> {
  const existing = await findTranscriptRow(req, meditationId)
  if (existing && isTranscriptionActive(existing, audioFilename)) return existing

  const unavailable = !lemonfoxApiKey()
  const data = {
    status: unavailable ? ('failed' as const) : ('queued' as const),
    audioFilename,
    language,
    outdated: false,
    error: unavailable ? TRANSCRIPTION_UNAVAILABLE_ERROR : null,
  }

  let row: MeditationTranscript
  if (existing) {
    row = await req.payload.update({
      collection: 'meditation-transcripts',
      id: existing.id,
      data,
      depth: 0,
      overrideAccess: true,
      req,
    })
  } else {
    try {
      row = await req.payload.create({
        collection: 'meditation-transcripts',
        data: { ...data, meditation: meditationId },
        depth: 0,
        overrideAccess: true,
        req,
      })
    } catch (error) {
      // Two first requests racing: the unique `meditation` column refuses the
      // second create, and the first one's row is the answer. Only a create can
      // lose that race, so an update's failure is reported instead — recovering
      // there would answer with the row unchanged and no job queued, making Try
      // again a silent no-op.
      const raced = await findTranscriptRow(req, meditationId)
      if (!raced) throw error
      return raced
    }
  }

  if (unavailable) return row

  await req.payload.jobs.queue({
    task: 'transcribeMeditation',
    input: { meditationId, audioFilename },
    queue: 'transcription',
    req,
  })

  runQueueSoon({
    payload: req.payload,
    queue: 'transcription',
    label: 'requestTranscription',
    context: { meditationId },
    delayMs,
  })

  return row
}
