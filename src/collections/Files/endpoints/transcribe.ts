import type { Endpoint } from 'payload'

import { requireManagerPermission } from '@/lib/endpoints'
import { transcribableMedia } from '@/lib/transcripts/media'
import { requestTranscript, transcriptRefusal as refusal } from '@/lib/transcripts/request'

/**
 * POST /api/files/:id/transcribe — ask for this file's recording to be
 * transcribed again.
 *
 * The admin panel is the only caller: Transcribe again on a file's transcript,
 * on the file itself or on a Path Step showing it (`useRetryTranscript`). Past
 * the gate and the read below it is `requestTranscript`: the same flow and the
 * same bounds as `POST /api/meditations/:id/transcribe`. The run is in the
 * file's own `spokenLanguage`, which a save changes, not this.
 *
 * ⚠ **No `requireActiveClient`: admin-panel only**, so no API client may call
 * it, and it is absent from the OpenAPI spec
 * (`tests/unit/openapi-custom-endpoints.spec.ts`).
 *
 * **Gated on `files: create`, not `update`.** Every editor role uploads files
 * but none edits them (`roles.ts`), and uploading one already transcribes it —
 * so the right to upload is the right to ask for the run again. A file is not
 * per locale, so the gate's locale scope narrows nothing here.
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
      noun: 'file',
    })
  },
}
