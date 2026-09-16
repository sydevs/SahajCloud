import type { CollectionBeforeValidateHook } from 'payload'

import { APIError } from 'payload'

import { countActiveRegistrations } from '@/lib/registrations/fullness'
import { evaluateRegistrationGate } from '@/lib/registrations/gating'
import { relationId } from '@/lib/utilities/relationId'
import { asTrustedReq } from '@/plugins/usage/hooks'

/**
 * Refuse a registration the event is not open to, with the machine-readable
 * code the Atlas widget maps to its UI.
 *
 * ⚠ **`beforeValidate`, not `beforeChange`.** Payload runs every
 * `beforeValidate` ahead of every `beforeChange`, and `prepareUserSubmission`
 * is a `beforeValidate` — so a `beforeChange` gate could not run "ahead of" it.
 * Listed before it in the array, this one does.
 *
 * That ordering is about **cost, not correctness**: `upsertUserByEmail` rides
 * the caller's `req`, so it is inside the create's transaction and a later
 * throw rolls its `users` row back either way. Going first saves that write
 * plus a `forms` read on a refused registration.
 *
 * ⚠ **Client-originated creates only.** A manager recording a registration by
 * hand on a full event is a deliberate act, not an attempt to slip past a
 * limit, and `POST /api/user-submissions` from a client key is the only path
 * the gate exists for. `prepareUserSubmission` splits on the same condition for
 * its URL scan.
 *
 * That one condition is also the importer's exemption. A Local API import of
 * historical rows — the Atlas seed importer, #799 — carries no client user, so
 * it never reaches the gate and needs no opt-out of its own.
 */
export const gateRegistration: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' || data?.type !== 'registration') return data
  if (req.user?.collection !== 'clients') return data

  // Not `required` on a registration row, deliberately — a registration may be
  // recorded before its occurrence is resolved. No event, nothing to gate.
  const eventId = relationId(data?.event)
  if (eventId == null) return data

  // Read it exactly as the endpoint this replaces did. `overrideAccess: false`
  // is what keeps 404 and 409 distinct: an event the caller may not see is
  // *absent*, while an ended one is found and refused `event_ended`.
  // `asTrustedReq` exempts the read from the client `select` requirement and
  // from `excludeFinishedEvents`.
  const { docs } = await req.payload.find({
    collection: 'events',
    where: { id: { equals: eventId } },
    limit: 1,
    depth: 0,
    overrideAccess: false,
    req: asTrustedReq(req),
  })

  if (docs.length === 0) {
    throw new APIError(
      'Event not found or not open for registration.',
      404,
      { code: 'event_not_found' },
      true,
    )
  }

  // ⚠ No `select` here on purpose. `evaluateRegistrationGate` reads
  // `registrationMode`, `registrationLimit`, `schedule` (through `shouldFinish`)
  // and `inactive`; a narrower projection silently changes the verdict rather
  // than failing.
  const event = docs[0]

  // The count→create window is not transactional, so a burst can overshoot the
  // limit by a few — an acceptable soft cap for a meditation class.
  const { totalDocs: registrationCount } = await countActiveRegistrations({
    payload: req.payload,
    eventId,
    req,
  })

  const rejection = evaluateRegistrationGate({ event, registrationCount, now: new Date() })
  if (rejection) {
    // `APIError`'s fourth argument is what puts `code` at `errors[].data.code`,
    // which is the envelope sydevs/SahajAtlasWeb#171 reads.
    throw new APIError(rejection.message, rejection.status, { code: rejection.code }, true)
  }

  return data
}
