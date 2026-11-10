import type { Endpoint, PayloadRequest } from 'payload'

import { requireManagerPermission } from '@/lib/endpoints'
import { normalizeLemonfoxWords } from '@/lib/lemonfox/normalize'
import {
  lemonfoxApiKey,
  requestLemonfoxTranscript,
  TRANSCRIPTION_UNAVAILABLE_ERROR,
} from '@/lib/lemonfox/transcribe'
import { isValidLocale } from '@/lib/locales'
import { groupWordsIntoCues, type Subtitles } from '@/lib/utilities/subtitles'

const refusal = (message: string, status: number): Response =>
  Response.json({ errors: [{ message }] }, { status })

/**
 * ⚠ **Under Cloudflare's 100 s origin-response limit.** This is a synchronous
 * admin POST through our zone, so an answer later than that never reaches the
 * browser and the admin is told nothing (`verifyEmbed.ts:159` records the
 * measured 524). The vendor does 30 minutes of audio in about a minute and the
 * longest intro is 4.5 minutes, so the headroom is real — unlike the queued
 * job's own five-minute bound, which has no client waiting.
 */
const VENDOR_TIMEOUT_MS = 90 * 1000

/**
 * POST /api/files/:id/subtitles — make subtitle cues from an MP3.
 *
 * The Path Step intro-subtitles control is the only caller
 * (`src/components/admin/IntroSubtitles/`). Keyed on the **`files` id** rather
 * than the lesson's, because that row is always saved while the lesson being
 * edited is not.
 *
 * ⚠ **No `requireActiveClient`, because no API client may call this.** It is
 * admin-panel only, gated on the authority to edit a Path Step in the request's
 * locale, and so deliberately absent from the OpenAPI spec —
 * `tests/unit/openapi-custom-endpoints.spec.ts` holds that.
 *
 * ⚠ **A run costs money, so the server decides whether to pay for one.** A
 * `transcripts` row that already carries this file's cues answers from them and
 * pays nothing; a failed run writes no row, so the next press pays once.
 *
 * ⚠ **An endpoint inherits no transaction.** Nothing here needs one: the single
 * write is the create, and the vendor call happens before it.
 */
export const fileSubtitles: Endpoint = {
  path: '/:id/subtitles',
  method: 'post',
  handler: async (req) => {
    const denied = requireManagerPermission({
      req,
      collection: 'lessons',
      operation: 'update',
      forbidden: 'You do not have permission to make subtitles for a Path Step.',
    })
    if (denied) return denied

    const id = Number(req.routeParams?.id)
    if (!Number.isInteger(id) || id <= 0) return refusal('Invalid file id.', 400)

    // The gate above proved `lessons: update` in this locale, and the cue row
    // records which language it was written in — so an unresolvable locale
    // cannot reach the vendor or the row. `?locale=all` is the realistic case.
    const locale = req.locale
    if (!locale || !isValidLocale(locale)) {
      return refusal('Choose a language in the admin panel before making subtitles.', 400)
    }

    // `overrideAccess` here and on the reads and the write below: the gate above
    // is this handler's authority, and `transcripts` carries no write grant of
    // its own (`Transcripts.ts`). `trash` is not passed, so a trashed file
    // reads as absent — the answer wanted.
    const file = await req.payload.findByID({
      collection: 'files',
      id,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: { filename: true, mimeType: true, url: true },
      req,
    })
    if (!file) return refusal('File not found.', 404)

    if (file.mimeType !== 'audio/mpeg') {
      // Worded so the admin knows the recording is wrong rather than the
      // server, and with no offer to retry: pressing again cannot help.
      return refusal(
        'Subtitles can only be made from an MP3 recording, and this file is not one.',
        415,
      )
    }

    const stored = await storedCuesFor(req, id)
    if (stored) return Response.json({ cues: stored, reused: true })

    const apiKey = lemonfoxApiKey()
    if (!apiKey) return refusal(TRANSCRIPTION_UNAVAILABLE_ERROR, 503)

    if (!file.url) {
      return refusal(
        'This recording has no public URL, so the subtitles service cannot fetch it.',
        409,
      )
    }

    let cues: Subtitles
    try {
      const body = await requestLemonfoxTranscript({
        apiKey,
        audioUrl: file.url,
        locale,
        timeoutMs: VENDOR_TIMEOUT_MS,
        wordTimings: true,
      })
      cues = groupWordsIntoCues(normalizeLemonfoxWords(body))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      req.payload.logger.error({
        msg: 'fileSubtitles: the subtitles run failed',
        fileId: id,
        locale,
        error: reason,
      })
      // 502, because the failure is the vendor's rather than this request's —
      // and the reason is returned rather than swallowed, since the admin is
      // the one who decides whether to press the button again.
      return refusal(`Could not make subtitles: ${reason}`, 502)
    }

    if (cues.length === 0) {
      return refusal('No speech was recognised in this recording, so there are no subtitles.', 422)
    }

    // No row on a failure, so this is below the vendor call. A row the delete
    // cascade on `files` takes with its file (`Files.ts`), and one
    // `queueTranscription` deliberately queues nothing for.
    try {
      await req.payload.create({
        collection: 'transcripts',
        data: {
          audioFilename: file.filename,
          language: locale,
          provider: 'lemonfox',
          segments: cues,
          source: { relationTo: 'files', value: id },
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
    } catch (error) {
      // ⚠ **`source` is `unique`, so two admins pressing at once race here**
      // and the loser's insert is refused. Re-read rather than reporting it:
      // the winner's row is cues for this same recording, which is what this
      // caller asked for — and an unhandled throw here answers 500 for a
      // request that succeeded in every way the caller can see.
      //
      // Re-reading, rather than matching the constraint's own error: that
      // match is a Postgres `detail` string for a polymorphic relationship
      // (`Meditations/endpoints/transcribe.ts` carries why), and a row that
      // now exists is the same answer whatever refused the insert.
      const winner = await storedCuesFor(req, id)
      if (winner) return Response.json({ cues: winner, reused: true })
      throw error
    }

    return Response.json({ cues, reused: false })
  },
}

/**
 * The cues already stored for this file, or `null` when there are none.
 *
 * ⚠ **`source` is polymorphic, so this is the one spelling Payload resolves.**
 * A bare `source` throws when the query is built, and `source.value` would
 * match the **meditation** of this number as well (`Transcripts.ts`).
 *
 * `overrideAccess`, because the handler's gate is this read's authority and
 * `transcripts` carries no grant of its own.
 */
async function storedCuesFor(req: PayloadRequest, fileId: number): Promise<Subtitles | null> {
  const { docs } = await req.payload.find({
    collection: 'transcripts',
    where: { source: { equals: { relationTo: 'files', value: fileId } } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const cues = docs[0]?.segments
  return Array.isArray(cues) && cues.length > 0 ? (cues as Subtitles) : null
}
