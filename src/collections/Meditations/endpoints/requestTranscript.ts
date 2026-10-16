import type { Endpoint } from 'payload'

import { findMeditationRecording } from '@/collections/Meditations/findMeditationRecording'
import { requestTranscription } from '@/collections/MeditationTranscripts/requestTranscription'
import { toTranscriptView } from '@/collections/MeditationTranscripts/view'

import { requireTranscriptAccess } from './transcriptAccess'

/**
 * POST /api/meditations/:id/transcript — the Transcript tab's **Transcribe**
 * and **Try again**: ask for a transcript of the meditation's current
 * recording, and start it.
 *
 * Manager-only, gated on `meditations: update` in the request locale, so the
 * caller must send `?locale=` (see `requireTranscriptAccess`). Responds `202`
 * with the `TranscriptView` for both buttons, and for a double click: every row
 * write and the dedupe behind it belong to `requestTranscription`.
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

    const row = await requestTranscription({
      req,
      meditationId: id,
      audioFilename,
      language: recording.locale,
      // No transaction wraps this handler, so the row and the job are already
      // committed and the queue run needs no delay.
      afterCommit: false,
    })

    return Response.json(toTranscriptView(row), { status: 202 })
  },
}
