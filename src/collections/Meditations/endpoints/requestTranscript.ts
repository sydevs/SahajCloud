import type { Endpoint } from 'payload'

import {
  findMeditationRecording,
  findTranscriptRow,
  isTranscriptionActive,
  toTranscriptView,
} from '@/collections/MeditationTranscripts/view'
import type { MeditationTranscript } from '@/payload-types'

import { requireTranscriptAccess } from './transcriptAccess'

/**
 * POST /api/meditations/:id/transcript — the Transcript tab's **Transcribe**
 * and **Try again**: queue a transcription of the meditation's current
 * recording, and start it.
 *
 * Manager-only, gated on `meditations: update` in the request locale.
 *
 * A request already on its way for the current recording is returned as it
 * stands, so a double click queues one job. Responds `202` with the
 * `TranscriptView` either way.
 */
export const requestMeditationTranscript: Endpoint = {
  path: '/:id/transcript',
  method: 'post',
  handler: async (req) => {
    const id = requireTranscriptAccess(
      req,
      'update',
      'You do not have permission to transcribe this meditation.',
    )
    if (id instanceof Response) return id

    const recording = await findMeditationRecording(req, id)
    if (!recording) {
      return Response.json({ errors: [{ message: 'Meditation not found.' }] }, { status: 404 })
    }
    const audioFilename = recording.filename
    if (!audioFilename) {
      return Response.json(
        { errors: [{ message: 'This meditation has no recording to transcribe.' }] },
        { status: 409 },
      )
    }

    const existing = await findTranscriptRow(req, id)
    const current = toTranscriptView(existing, audioFilename)
    if (isTranscriptionActive(current)) return Response.json(current, { status: 202 })

    // Segments always belong to the recording the row names, so a new request
    // clears the last one's.
    const data = {
      status: 'queued' as const,
      audioFilename,
      segments: null,
      provider: null,
      language: null,
      error: null,
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
          data: { ...data, meditation: id },
          depth: 0,
          overrideAccess: true,
          req,
        })
      } catch (error) {
        // Two first requests racing: the unique `meditation` column refuses the
        // second create, and the first one's request is the answer. Only a
        // create can lose that race, so an update's failure is reported: a
        // recovery here would answer 202 with the row unchanged and queue no
        // job, making Try again a silent no-op.
        const raced = await findTranscriptRow(req, id)
        if (!raced) throw error
        return Response.json(toTranscriptView(raced, audioFilename), { status: 202 })
      }
    }

    await req.payload.jobs.queue({
      task: 'transcribeMeditation',
      input: { meditationId: id, audioFilename },
      queue: 'transcription',
      req,
    })

    // No transaction wraps this handler, so the row and the job are committed
    // and the run can start now. The queue's autoRun picks up a lost start.
    // Not under NODE_ENV=test, where a background run would race the specs.
    if (process.env.NODE_ENV !== 'test') {
      req.payload.jobs.run({ queue: 'transcription' }).catch((error: unknown) => {
        req.payload.logger.warn({
          msg: 'requestMeditationTranscript: immediate queue run failed — autoRun will retry',
          meditationId: id,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }

    return Response.json(toTranscriptView(row, audioFilename), { status: 202 })
  },
}
