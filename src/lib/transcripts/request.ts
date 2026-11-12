import type { TranscriptSource } from './sync'
import type { PayloadRequest } from 'payload'

import {
  APIError,
  commitTransaction,
  initTransaction,
  killTransaction,
  ValidationError,
} from 'payload'

import type { LocaleCode } from '@/lib/locales'
import {
  retranscribeWaitLabel,
  retranscribeWaitMs,
  transcriptPhase,
  transcriptPhaseIsRetryable,
} from '@/lib/meditations/transcriptBounds'

export const transcriptRefusal = (
  message: string,
  status: number,
  headers?: HeadersInit,
): Response => Response.json({ errors: [{ message }] }, { headers, status })

/**
 * Whether this is the `unique` index on `source` refusing a second row — two
 * requests racing, where the loser's insert lands after the winner's.
 *
 * ⚠ **The driver's SQLSTATE never reaches here.** `handleUpsertError` in
 * `@payloadcms/drizzle` converts a `23505` into this `ValidationError` and does
 * not keep the Postgres error as `cause`, so `@/lib/databaseErrors` cannot see
 * it and the path is what is left.
 *
 * ⚠ **And that path is a Postgres `detail` string, not a field name.** `source`
 * is polymorphic, so its unique index lives on `transcripts_rels` as
 * `UNIQUE(<target>_id, path)` — and `adapter.fieldConstraints`, the map that
 * turns a constraint name into a field path, is filled only for column-backed
 * relationships. With no entry to match, `handleUpsertError` falls back to the
 * `Key (…)` list in Postgres's own `detail`. `transcripts` carries no unique
 * column of its own, and the caller supplies the id itself, so a validation
 * error naming that pair can only be the duplicate.
 */
const isDuplicateTranscript = (error: ValidationError, source: TranscriptSource): boolean =>
  error.data.errors.some(({ path }) => path === `${source.relationTo}_id, path`)

/**
 * Ask for a recording to be transcribed again: the delete-and-create pair
 * `syncRecordingTranscript` runs for a replaced recording, behind the bounds a
 * paid run needs. The new row's own `afterChange` queues the run.
 *
 * The caller owns the gate and the reads that prove the recording exists — this
 * owns everything after, so a meditation and a file are refused the same way.
 *
 * ⚠ **A run costs money, so the server decides whether to pay for one**
 * (sydevs/SahajCloud#984, Decision 2). Three bounds, in order: no run may be in
 * flight, the phase must be retryable, and the existing row must be older than
 * the cooldown. All are read from the functions the Transcript panel offers the
 * button from, so the control cannot promise what this refuses.
 *
 * **A changed `language` passes the last two.** A file's language is detected,
 * and the fix for a wrong guess is a run in the right one (#1016); refusing it
 * until the cooldown would leave a finished transcript in the wrong language for
 * ten minutes for no saving.
 *
 * ⚠ **It does not pass the first.** A language change deletes the row it finds,
 * so exempting a run in flight would throw away a run already paid for and queue
 * another — and alternating `?language=` between two values would do that as fast
 * as an editor can click, which is the bill Decision 2 exists to bound.
 */
export async function requestTranscript(
  req: PayloadRequest,
  {
    source,
    audioFilename,
    language,
    noun,
  }: {
    source: TranscriptSource
    audioFilename: string
    language: LocaleCode | null
    /** How a refusal names the recording: "meditation", "file". */
    noun: string
  },
): Promise<Response> {
  // ⚠ **No `select`, because the row has to arrive whole.** `status` is
  // virtual, computed by its own `afterRead` from `segmentCount` and `job`
  // (`Transcripts.ts`) — so a `select` would starve that hook and the phase
  // below would read every row as `completed`, refusing every retry. The
  // integration lane's phase cases are what hold this.
  //
  // `overrideAccess` here and on the two writes below: the caller's gate is the
  // authority, and `transcripts` carries no write grant of its own.
  const { docs } = await req.payload.find({
    collection: 'transcripts',
    where: { source: { equals: source } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const existing = docs[0]
  const languageChanged = Boolean(existing && language && existing.language !== language)

  if (existing) {
    const phase = transcriptPhase(existing)
    if (phase === 'pending') {
      return transcriptRefusal(`A transcription for this ${noun} is already in progress.`, 409)
    }
    if (!languageChanged) {
      if (!transcriptPhaseIsRetryable(phase)) {
        return transcriptRefusal(
          'This recording already has a transcript. Replace the recording to redo it.',
          409,
        )
      }
      const waitMs = retranscribeWaitMs(existing.createdAt)
      if (waitMs > 0) {
        return transcriptRefusal(
          `This transcript was asked for a moment ago. Try again in ${retranscribeWaitLabel(waitMs)}.`,
          429,
          { 'Retry-After': String(Math.ceil(waitMs / 1000)) },
        )
      }
    }
  }

  // ⚠ **One transaction, or a create that throws leaves the recording with no
  // transcript at all.** An endpoint inherits none — a hook would — so this
  // opens its own and kills it on any throw, which puts the previous row back.
  // `create` before `delete` is not an alternative: `source` is unique.
  const opened = await initTransaction(req)
  try {
    if (existing) {
      // By `where`, not by id: a request that loses the race finds the row
      // already gone, and a delete by id answers that with a 404 — which reads
      // as a missing recording. Deleting nothing leaves the duplicate insert
      // below to say what actually happened.
      //
      // ⚠ **A delete by `where` collects per-document failures into `errors`
      // rather than throwing.** Unread, a row that refused to go would fall
      // through to the create, trip the unique index, and be reported as a race
      // — with the real cause logged nowhere.
      const { errors } = await req.payload.delete({
        collection: 'transcripts',
        where: { source: { equals: source } },
        overrideAccess: true,
        req,
      })
      if (errors.length > 0) {
        throw new Error(
          `the previous transcript could not be deleted: ${errors[0]?.message ?? 'no reason given'}`,
        )
      }
    }
    // No row at all is the lost-run case — create without the delete. A file
    // keeps the language its last run settled on unless the request names one.
    const created = await req.payload.create({
      collection: 'transcripts',
      data: { audioFilename, language: language ?? existing?.language ?? null, source },
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
    if (error instanceof ValidationError && isDuplicateTranscript(error, source)) {
      return transcriptRefusal(`A transcription for this ${noun} was just asked for.`, 409)
    }
    if (error instanceof APIError) return transcriptRefusal(error.message, error.status)

    req.payload.logger.error({
      msg: 'requestTranscript: could not ask for a transcript',
      source,
      error: error instanceof Error ? error.message : String(error),
    })
    return transcriptRefusal('Could not ask for a transcript. Please try again.', 500)
  }
}
