import type { Endpoint } from 'payload'

import {
  findMeditationRecording,
  findTranscriptRow,
  toTranscriptView,
} from '@/collections/MeditationTranscripts/view'
import { requireActiveManager } from '@/lib/endpoints'
import { bypassPermissions, hasPermission, roleScopeFromLocale } from '@/plugins/access'

/**
 * GET /api/meditations/:id/transcript — the admin Transcript tab's read: the
 * meditation's transcript and how far its transcription has got.
 *
 * Manager-only, gated on `meditations: read` in the request locale. NOT a
 * client endpoint, so it skips `requireActiveClient` and is not published in
 * the OpenAPI spec. Response: `TranscriptView` (`@/lib/meditations/transcript`).
 */
export const meditationTranscript: Endpoint = {
  path: '/:id/transcript',
  method: 'get',
  handler: async (req) => {
    const denied = requireActiveManager(req)
    if (denied) return denied

    if (
      !hasPermission(
        {
          user: req.user,
          collection: 'meditations',
          operation: 'read',
          locale: roleScopeFromLocale(req.locale),
        },
        bypassPermissions,
      )
    ) {
      return Response.json(
        { errors: [{ message: 'You do not have permission to read this meditation.' }] },
        { status: 403 },
      )
    }

    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ errors: [{ message: 'Invalid meditation id.' }] }, { status: 400 })
    }

    const recording = await findMeditationRecording(req, id)
    if (!recording) {
      return Response.json({ errors: [{ message: 'Meditation not found.' }] }, { status: 404 })
    }

    return Response.json(toTranscriptView(await findTranscriptRow(req, id), recording.filename))
  },
}
