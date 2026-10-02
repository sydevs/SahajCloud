import type { Endpoint } from 'payload'

import {
  findMeditationRecording,
  findTranscriptRow,
  toTranscriptView,
} from '@/collections/MeditationTranscripts/view'

import { requireTranscriptAccess } from './transcriptAccess'

/**
 * GET /api/meditations/:id/transcript — the admin Transcript tab's read: the
 * meditation's transcript and how far its transcription has got.
 *
 * Manager-only, gated on `meditations: read` in the request locale. Response:
 * `TranscriptView` (`@/lib/meditations/transcript`).
 */
export const meditationTranscript: Endpoint = {
  path: '/:id/transcript',
  method: 'get',
  handler: async (req) => {
    const id = requireTranscriptAccess(
      req,
      'read',
      'You do not have permission to read this meditation.',
    )
    if (id instanceof Response) return id

    // Neither read feeds the other, and the tab polls this endpoint.
    const [recording, row] = await Promise.all([
      findMeditationRecording(req, id),
      findTranscriptRow(req, id),
    ])
    if (!recording) {
      return Response.json({ errors: [{ message: 'Meditation not found.' }] }, { status: 404 })
    }

    return Response.json(toTranscriptView(row, recording.filename))
  },
}
