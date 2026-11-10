import type { Endpoint, PayloadRequest } from 'payload'

import { errorResponse, requireManagerPermission } from '@/lib/endpoints'
import { normalizeLemonfoxWords } from '@/lib/lemonfox/normalize'
import {
  lemonfoxApiKey,
  requestLemonfoxTranscript,
  TRANSCRIPTION_UNAVAILABLE_ERROR,
} from '@/lib/lemonfox/transcribe'
import { isValidLocale } from '@/lib/locales'
import { groupWordsIntoCues, type Subtitles } from '@/lib/utilities/subtitles'
import { originOf } from '@/lib/utilities/url'

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
 * ⚠ **The gated collection is declared here, never taken from the request.**
 * `videos.subtitles` is the same cue column elsewhere and the obvious second
 * caller; serving it means a second declared target (`docs/rules/endpoints.md`).
 *
 * ⚠ **No `requireActiveClient`: admin-panel only**, so no API client may call
 * it, and it is absent from the OpenAPI spec
 * (`tests/unit/openapi-custom-endpoints.spec.ts`).
 *
 * ⚠ **A run costs money, so the server decides whether to pay for one.** A
 * `transcripts` row already carrying this file's cues answers from them; a
 * failed run writes no row, so the next press pays once. Keyed on the **file**,
 * not on (file, language): cues are a property of the recording, and the row's
 * `language` records which run made them rather than keying the reuse.
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
    if (!Number.isInteger(id) || id <= 0) return errorResponse('Invalid file id.', 400)

    // The gate above proved `lessons: update` in this locale, and the cue row
    // records which language it was written in — so an unresolvable locale
    // cannot reach the vendor or the row. `?locale=all` is the realistic case.
    const locale = req.locale
    if (!locale || !isValidLocale(locale)) {
      return errorResponse('Choose a language in the admin panel before making subtitles.', 400)
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
    if (!file) return errorResponse('File not found.', 404)

    if (file.mimeType !== 'audio/mpeg') {
      // Worded so the admin knows the recording is wrong rather than the
      // server, and offers no retry: pressing again cannot help.
      return errorResponse(
        'Subtitles can only be made from an MP3 recording, and this file is not one.',
        415,
      )
    }

    const existing = await storedCuesFor(req, id)
    if (existing) return Response.json({ cues: existing, reused: true })

    const apiKey = lemonfoxApiKey()
    if (!apiKey) return errorResponse(TRANSCRIPTION_UNAVAILABLE_ERROR, 503)

    // ⚠ **An absolute URL, not merely a non-empty one.** The vendor fetches
    // this itself, and with no Cloudflare credentials `url` is the relative
    // `/api/files/file/<name>` (`storage/urlFields.ts`) — which a non-empty
    // test passes and the vendor then cannot resolve.
    const audioUrl = file.url
    if (!audioUrl || !originOf(audioUrl)) {
      return errorResponse(
        'This recording has no public address, so the subtitles service cannot fetch it.',
        409,
      )
    }

    let cues: Subtitles
    try {
      const body = await requestLemonfoxTranscript({
        apiKey,
        audioUrl,
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
      // 502, because the failure is the vendor's rather than this request's.
      // The reason reaches the admin, who decides whether to press again.
      return errorResponse(`Could not make subtitles: ${reason}`, 502)
    }

    if (cues.length === 0) {
      return errorResponse(
        'No speech was recognised in this recording, so there are no subtitles.',
        422,
      )
    }

    // No row on a failure, so this is below the vendor call. A row the delete
    // cascade on `files` takes with its file (`Files.ts`), and one
    // `queueTranscription` deliberately queues nothing for.
    let stored: Subtitles
    try {
      const created = await req.payload.create({
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
      // ⚠ **The row's cues, not the ones just sent.** `applyGlossaryToSegments`
      // is a `beforeChange` hook on `transcripts`, so it rewrites the vendor's
      // spellings to ours on the way in (#1084) — answering with what was sent
      // would hand the admin uncorrected words on the first press and the
      // corrected ones on the second.
      stored = (created.segments as Subtitles | null) ?? cues
    } catch (error) {
      // ⚠ **`source` is `unique`, so two admins pressing at once race here**
      // and the loser's insert is refused. The winner's row is cues for this
      // same recording, which is what this caller asked for, so re-read it
      // rather than answering 500 for a request that succeeded.
      const winner = await storedCuesFor(req, id)
      if (winner) return Response.json({ cues: winner, reused: true })
      throw error
    }

    return Response.json({ cues: stored, reused: false })
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
    // The cues are the whole answer, and a bounded `select` is what keeps the
    // two virtual fields' `afterRead` hooks — and the `payload-jobs` read one
    // of them can make — out of a call that wants one column
    // (`docs/rules/endpoints.md`).
    select: { segments: true },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const cues = docs[0]?.segments
  return Array.isArray(cues) && cues.length > 0 ? (cues as Subtitles) : null
}
