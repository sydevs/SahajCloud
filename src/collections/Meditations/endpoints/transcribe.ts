import type { Endpoint, PayloadRequest } from 'payload'

import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  ValidationError,
} from 'payload'

import { requireManagerPermission } from '@/lib/endpoints'
import {
  retranscribeWaitLabel,
  retranscribeWaitMs,
  transcriptPhase,
  transcriptPhaseIsRetryable,
} from '@/lib/meditations/transcriptBounds'
import type { MeditationTranscript } from '@/payload-types'

const refusal = (message: string, status: number, headers?: HeadersInit): Response =>
  Response.json({ errors: [{ message }] }, { headers, status })

/**
 * Whether this is the `unique` index on `meditation` refusing a second row —
 * two requests racing, where the loser's insert lands after the winner's.
 *
 * ⚠ **The driver's SQLSTATE never reaches here.** `handleUpsertError` in
 * `@payloadcms/drizzle` converts a `23505` into this `ValidationError` and does
 * not keep the Postgres error as `cause`, so `@/lib/databaseErrors` cannot see
 * it and the field path is what is left. `meditation` is the only unique column
 * on the collection, and this handler supplies the id itself, so a validation
 * error naming it can only be the duplicate.
 */
const isDuplicateTranscript = (error: ValidationError): boolean =>
  error.data.errors.some(({ path }) => path === 'meditation')

/**
 * POST /api/meditations/:id/transcribe — ask for this meditation's recording to
 * be transcribed again.
 *
 * The Transcript tab's Transcribe-again button is the only caller
 * (`RetryTranscript.tsx`). Manager-only, gated on the same `meditations: update`
 * permission an editor already holds, and so deliberately not published in the
 * OpenAPI spec — `tests/unit/openapi-custom-endpoints.spec.ts` holds that. Only
 * one write comes back from sydevs/SahajCloud#968: the read is still the
 * `meditations.transcript` join plus the collection the tab queries.
 *
 * A retry is the delete-and-create pair `syncMeditationTranscript` already runs
 * for a replaced recording. Nothing else needs writing — the new row's own
 * `afterChange` queues the run and kicks the queue.
 *
 * ⚠ **A run costs money, so the server decides whether to pay for one**
 * (sydevs/SahajCloud#984, Decision 2). Two bounds, in order: the phase must be
 * retryable, and the existing row must be older than the cooldown. Both are
 * read from the functions the tab offers the button from, so the control cannot
 * promise what this refuses.
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
    // `TranscribeMeditation` checks its run against — storing the published
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
    if (!meditation.filename) {
      return refusal('This meditation has no recording to transcribe.', 409)
    }

    const existing = await findTranscript(req, id)

    if (existing) {
      const phase = transcriptPhase(existing)
      if (!transcriptPhaseIsRetryable(phase)) {
        return refusal(
          phase === 'completed'
            ? 'This recording already has a transcript. Replace the recording to redo it.'
            : 'A transcription for this meditation is already in progress.',
          409,
        )
      }
      const waitMs = retranscribeWaitMs(existing.createdAt)
      if (waitMs > 0) {
        return refusal(
          `This transcript was asked for a moment ago. Try again in ${retranscribeWaitLabel(waitMs)}.`,
          429,
          { 'Retry-After': String(Math.ceil(waitMs / 1000)) },
        )
      }
    }

    // ⚠ **One transaction, or a create that throws leaves the meditation with
    // no transcript at all.** An endpoint inherits none — a hook would
    // (`queueTranscription.ts`) — so this opens its own and kills it on any
    // throw, which puts the previous row back. `create` before `delete` is not
    // an alternative: `meditation` is unique.
    const opened = await initTransaction(req)
    try {
      if (existing) {
        // By `where`, not by id: a request that loses the race finds the row
        // already gone, and a delete by id answers that with a 404 — which
        // reads as a missing meditation. Deleting nothing leaves the duplicate
        // insert below to say what actually happened.
        //
        // ⚠ **A delete by `where` collects per-document failures into `errors`
        // rather than throwing.** Unread, a row that refused to go would fall
        // through to the create, trip the unique index, and be reported as a
        // race — with the real cause logged nowhere.
        const { errors } = await req.payload.delete({
          collection: 'meditation-transcripts',
          where: { meditation: { equals: id } },
          overrideAccess: true,
          req,
        })
        if (errors.length > 0) {
          throw new Error(
            `the previous transcript could not be deleted: ${errors[0]?.message ?? 'no reason given'}`,
          )
        }
      }
      // No row at all is the lost-run case — create without the delete.
      const created = await req.payload.create({
        collection: 'meditation-transcripts',
        data: {
          audioFilename: meditation.filename,
          language: meditation.locale,
          meditation: id,
        },
        depth: 0,
        overrideAccess: true,
        req,
      })
      if (opened) await commitTransaction(req)
      return Response.json({ ok: true, transcriptId: created.id })
    } catch (error) {
      await killTransaction(req)
      // A second request, not a server fault — and the winner's run is already
      // queued. Before the `APIError` arm, which a `ValidationError` would
      // otherwise answer with its own 400.
      if (error instanceof ValidationError && isDuplicateTranscript(error)) {
        return refusal('A transcription for this meditation was just asked for.', 409)
      }
      if (error instanceof APIError) return refusal(error.message, error.status)

      req.payload.logger.error({
        msg: 'meditationTranscribe: could not ask for a transcript',
        meditationId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return refusal('Could not ask for a transcript. Please try again.', 500)
    }
  },
}

/**
 * The meditation's transcript row, or `undefined`.
 *
 * ⚠ **No `select`, because the row has to arrive whole.** `status` is virtual,
 * computed by its own `afterRead` from `segments` and `job`
 * (`MeditationTranscripts.ts`) — so a `select` would starve that hook and the
 * phase above would read every row as `completed`, refusing every retry. The
 * integration lane's phase cases are what hold this. `meditation` is unique, so
 * there is at most one row.
 */
async function findTranscript(
  req: PayloadRequest,
  meditationId: number,
): Promise<MeditationTranscript | undefined> {
  const { docs } = await req.payload.find({
    collection: 'meditation-transcripts',
    where: { meditation: { equals: meditationId } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs[0]
}
