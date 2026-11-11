import type { Endpoint } from 'payload'

import { requireManagerPermission } from '@/lib/endpoints'
import { isValidLocale } from '@/lib/locales'
import { transcribableMedia } from '@/lib/transcripts/media'
import { requestTranscript, transcriptRefusal as refusal } from '@/lib/transcripts/request'

/**
 * POST /api/files/:id/transcribe — ask for this file's recording to be
 * transcribed again, optionally in a named language (`?language=cs`).
 *
 * The Transcript panel is the only caller (`RecordingTranscript`), on the file
 * itself or on a Path Step showing the file's transcript. Past the gate and the
 * read below it is `requestTranscript`: the same flow and the same bounds as
 * `POST /api/meditations/:id/transcribe`.
 *
 * ⚠ **No `requireActiveClient`: admin-panel only**, so no API client may call
 * it, and it is absent from the OpenAPI spec
 * (`tests/unit/openapi-custom-endpoints.spec.ts`).
 *
 * **Gated on `files: create`, not `update`.** Every editor role uploads files
 * but none edits them (`roles.ts`), and uploading one already transcribes it —
 * so the right to upload is the right to ask for the run again. A file has no
 * language of its own, so the gate's locale scope narrows nothing here.
 *
 * `language` corrects the language a run detected. The transcript is the
 * file's, so a correction applies everywhere the file is used — which is the
 * point of keeping it there (#1016).
 */
export const fileTranscribe: Endpoint = {
  path: '/:id/transcribe',
  method: 'post',
  handler: async (req) => {
    const denied = requireManagerPermission({
      req,
      collection: 'files',
      operation: 'create',
      forbidden: 'You do not have permission to transcribe this file.',
    })
    if (denied) return denied

    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id) || id <= 0) return refusal('Invalid file id.', 400)

    const requested = req.query?.language
    if (requested !== undefined && (typeof requested !== 'string' || !isValidLocale(requested))) {
      return refusal('That is not a language this app offers.', 400)
    }
    const language = typeof requested === 'string' && isValidLocale(requested) ? requested : null

    // The gate above is this read's authority. `trash` is not passed, so a
    // trashed file reads as absent — the answer wanted.
    const file = await req.payload.findByID({
      collection: 'files',
      id,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: { filename: true, mimeType: true },
      req,
    })
    if (!file) return refusal('File not found.', 404)
    if (!file.filename) return refusal('This file has no recording to transcribe.', 409)
    if (!transcribableMedia(file.mimeType)) {
      return refusal('Only audio and video files can be transcribed.', 415)
    }

    return requestTranscript(req, {
      source: { relationTo: 'files', value: id },
      audioFilename: file.filename,
      language,
      noun: 'file',
    })
  },
}
