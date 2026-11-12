import type { Endpoint } from 'payload'

import { requireManagerPermission } from '@/lib/endpoints'
import { requestTranscript, transcriptRefusal as refusal } from '@/lib/transcripts/request'
import { isOutsideWritableLocale } from '@/plugins/access/localeScopedWrites'

/**
 * POST /api/meditations/:id/transcribe — ask for this meditation's recording to
 * be transcribed again.
 *
 * The Transcript tab's Transcribe-again button is the only caller
 * (`useRetryTranscript`). Manager-only, gated on the same `meditations: update`
 * permission an editor already holds **and** on the meditation's own language,
 * and so deliberately not published in the
 * OpenAPI spec — `tests/unit/openapi-custom-endpoints.spec.ts` holds that. Only
 * one write comes back from sydevs/SahajCloud#968: the read is still the
 * `meditations.transcript` join plus the collection the tab queries.
 *
 * Past the gate and the reads below, the retry and its bounds are
 * `requestTranscript`'s, shared with `POST /api/files/:id/transcribe`.
 */
export const meditationTranscribe: Endpoint = {
  path: '/:id/transcribe',
  method: 'post',
  handler: async (req) => {
    const denied = requireManagerPermission({
      req,
      collection: 'meditations',
      operation: 'update',
      forbidden: 'You do not have permission to transcribe this meditation.',
    })
    if (denied) return denied

    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id) || id <= 0) {
      return refusal('Invalid meditation id.', 400)
    }

    // The **draft's** recording, which is the one the editor hears and the one
    // `TranscribeRecording` checks its run against — storing the published
    // filename would make every run throw "the recording was replaced".
    //
    // The gate above is this read's authority: it proved `meditations: update`
    // in the request's locale, which carries implicit project read. `trash` is
    // not passed, so a trashed meditation still reads as absent — the answer
    // wanted.
    const meditation = await req.payload.findByID({
      collection: 'meditations',
      id,
      depth: 0,
      draft: true,
      disableErrors: true,
      overrideAccess: true,
      select: { filename: true, locale: true },
      req,
    })
    if (!meditation) return refusal('Meditation not found.', 404)
    // ⚠ **The gate above proves a grant, never a language.** A meditation IS
    // one language and `meditations-editor` is granted per locale, so every
    // other write narrows to the locale the role was read in — a narrowing that
    // travels as a `Where` and so reaches none of the reads below
    // (`src/plugins/access/localeScopedWrites.ts`, #980). Without this the
    // grant stays collection-wide at this one door, and a `fr`-only editor
    // deletes an `en` transcript and buys a new run.
    if (isOutsideWritableLocale(req, meditation.locale)) {
      return refusal('You can only transcribe meditations in the language you are editing in.', 403)
    }
    if (!meditation.filename) {
      return refusal('This meditation has no recording to transcribe.', 409)
    }

    return requestTranscript(req, {
      source: { relationTo: 'meditations', value: id },
      audioFilename: meditation.filename,
      language: meditation.locale,
      noun: 'meditation',
    })
  },
}
