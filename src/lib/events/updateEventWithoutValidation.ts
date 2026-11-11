import type { Payload, PayloadRequest, RequestContext, Where } from 'payload'

import { updateIfUnchanged } from '@/lib/atomicWrites/updateIfUnchanged'
import type { Event } from '@/payload-types'

/**
 * The ceiling on what a bookkeeping write may touch — the union across all
 * three writers. It is not any one caller's allowance: each narrows `data` to
 * the fields it owns, so a write skipping validation cannot reach a field its
 * caller has no business touching.
 */
export type EventBookkeeping = Partial<
  Pick<
    Event,
    | '_status'
    | 'activityLog'
    | 'confidenceScore'
    | 'nextCheckAt'
    | 'registrationsFull'
    | 'systemMeta'
    | 'verificationStage'
  >
>

/**
 * Write derived bookkeeping onto an event without re-validating the document.
 *
 * Payload's `beforeValidate` field walk fills every absent field from the
 * stored document, so `beforeChange` validates the merged whole — a partial
 * update is checked as if an editor had re-submitted the entire event. An event
 * whose *stored* data fails a validator added after the row was written could
 * therefore never be advanced, finished or logged (#835), and a visitor's
 * registration or feedback vote was rolled back by a manager's data problem
 * (#842).
 *
 * `unpublishAllLocales` is Payload's flag, named for the operation it was built
 * for rather than for what is wanted here. Under it Payload validates only the
 * top-level fields the write submits (`shouldLimitValidationToSubmittedFields`
 * in `collections/operations/utilities/update.js`, since 3.90) and skips the
 * stored rest — the only such scoping that still writes the main row. No
 * supported argument does this (payloadcms/payload#18375 asks for one).
 * `draft: true` skips validation too but writes a version and no main row, so
 * the event would keep its old stage and stay due forever. The unpublishing
 * half never runs: Payload gates it on `versions.drafts.localizeStatus`, which
 * Events omits.
 *
 * So a bad value in *these* fields is still refused. `EventBookkeeping` is what
 * keeps an unrelated field from arriving. And `saveVersion({ unpublish })`
 * overwrites the `latest: true` version instead of appending one, so a
 * bookkeeping write lands on top of a manager's unsaved draft version (#841).
 *
 * A write that applies editor-supplied content must not come through here — it
 * has to validate. Verifying an event is such a write: broken stored data must
 * be fixed before the event is verified (#842).
 *
 * ⚠ Safe only while Events omits `versions.drafts.localizeStatus` — see the
 * warning on `versions` in `Events.ts`.
 *
 * `expect` guards a write that follows slow work: see
 * {@link updateIfUnchanged}. It answers whether the write landed; without one
 * the write is unconditional and the answer is always `true`.
 */
export async function updateEventBookkeeping(args: {
  payload: Payload
  id: number
  data: EventBookkeeping
  req?: PayloadRequest
  context?: RequestContext
  /** The values the caller read, where something could have changed them since. */
  expect?: Where
}): Promise<boolean> {
  const { payload, id, data, req, context, expect } = args

  const options = {
    collection: 'events' as const,
    data,
    // Spread `req.context` here rather than at each call site. Payload merges
    // it with this argument itself, so the spread is belt-and-braces — but
    // stating it once means no caller has to know that, and a caller passing
    // its own `context` cannot look like it is replacing the flags its request
    // carries (the trusted-req skip).
    context: { ...req?.context, ...context, skipVerifyHook: true },
    overrideAccess: true,
    unpublishAllLocales: true,
    // No caller wants the updated doc, and the default depth is 2 — so the
    // post-write afterRead would populate `region`, `manager`, `submitter` and
    // up to seven `images` per write, then discard them. Two of the three
    // callers run inside a visitor's transaction.
    depth: 0,
    req,
  }

  if (expect) return updateIfUnchanged({ payload, id, expect, ...options })

  await payload.update({ ...options, id })
  return true
}
