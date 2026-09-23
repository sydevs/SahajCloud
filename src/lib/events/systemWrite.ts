import type { Payload, PayloadRequest, RequestContext } from 'payload'

import type { Event } from '@/payload-types'

/** The derived fields a bookkeeping write is allowed to touch. */
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
 * `unpublishAllLocales` is the only argument that skips that validation while
 * still writing the main row. `draft: true` skips it too but writes a version
 * and no main row, so the event would keep its old stage and stay due forever.
 *
 * Two consequences to keep in view. It skips validation of *these* writes too,
 * not only of the stored fields — every value here comes from a pinned helper,
 * and `EventBookkeeping` is what keeps an unrelated field from arriving. And
 * `saveVersion({ unpublish })` overwrites the `latest: true` version instead of
 * appending one, so a bookkeeping write lands on top of a manager's unsaved
 * draft version. Both ways of skipping validation behave this way (#841).
 *
 * A write that applies editor-supplied content must not come through here — it
 * has to validate. Verifying an event is such a write: broken stored data must
 * be fixed before the event is verified (#842).
 *
 * ⚠ Safe only while Events omits `versions.drafts.localizeStatus` — see the
 * warning on `versions` in `Events.ts`.
 */
export async function updateEventBookkeeping(args: {
  payload: Payload
  id: number
  data: EventBookkeeping
  req?: PayloadRequest
  context?: RequestContext
}): Promise<void> {
  const { payload, id, data, req, context } = args

  await payload.update({
    collection: 'events',
    id,
    data,
    // Merge rather than replace: a caller spreads its own `req.context` in to
    // keep the flags that request carries (the trusted-req skip) alive across
    // this write.
    context: { ...(context ?? {}), skipVerifyHook: true },
    overrideAccess: true,
    unpublishAllLocales: true,
    req,
  })
}
