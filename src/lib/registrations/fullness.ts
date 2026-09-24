import type { Payload, PayloadRequest, Where } from 'payload'

import { updateEventBookkeeping } from '@/lib/events/updateEventWithoutValidation'
import type { Event } from '@/payload-types'
import { asTrustedReq } from '@/plugins/usage/hooks'

import { activeRegistrationWhere } from './active'

/** The event fields that decide capacity. */
export interface EventFullnessInput {
  registrationMode?: string | null
  registrationLimit?: number | null
}

/**
 * Whether an event is at capacity: `sahaj-atlas` registration mode, a set limit,
 * and a registration count that has reached it. `external` mode and a blank
 * limit (`null`/`undefined` = unlimited) are never full; a limit of `0` is full
 * from the first attempt (`0 >= 0`).
 *
 * The single definition of "full", shared by the registration gate
 * (`evaluateRegistrationGate`) and the denormalized `registrationsFull` signal
 * the Atlas widget reads.
 */
export function isEventFull(event: EventFullnessInput, registrationCount: number): boolean {
  return (
    event.registrationMode === 'sahaj-atlas' &&
    typeof event.registrationLimit === 'number' &&
    registrationCount >= event.registrationLimit
  )
}

/**
 * How many seats an event has taken: `user-submissions` rows of
 * `type: registration` that still count (`activeRegistrationWhere`), so a
 * `spam`, `rejected` or `failed` row frees its seat.
 *
 * One helper rather than the same `where` re-derived at each call site — the
 * create gate, this file's flag sync and the Events capacity hook all ask the
 * identical question, and three spellings of it is three chances to drift.
 */
export async function countActiveRegistrations(args: {
  payload: Payload
  eventId: number
  req?: PayloadRequest
}): Promise<{ totalDocs: number }> {
  const { payload, eventId, req } = args
  const where: Where = { and: [{ event: { equals: eventId } }, activeRegistrationWhere] }

  return payload.count({ collection: 'user-submissions', where, overrideAccess: true, req })
}

/**
 * Recompute an event's denormalized `registrationsFull` flag from a live
 * registration count and persist it — only when it actually flips. Called from
 * the `user-submissions` create/delete hooks so the flag the Atlas widget reads
 * stays O(1) on the feed (no per-event COUNT at read time).
 *
 * The flag changes at most a couple of times over an event's life, so guarding
 * the write on a real change keeps version churn on the drafts-enabled Events
 * collection negligible. `skipVerifyHook` stops this system write from
 * re-opening the verification cycle (matching the ExpireEvents writes). A
 * missing event (e.g. one just deleted) is a no-op.
 */
export async function syncEventRegistrationsFull(args: {
  payload: Payload
  eventId: number
  req?: PayloadRequest
}): Promise<void> {
  const { payload, eventId } = args
  // A registration arrives through the widget, so the caller's req carries a
  // client user. Elevate it to a trusted req, or the client query gate rejects
  // the event read below — a client find with no `select`. `overrideAccess`
  // still covers permissions. The write no longer needs the elevation: skipping
  // validation skips the `regions` filterOptions find it used to run.
  const req = args.req ? asTrustedReq(args.req) : undefined

  // The event read and the registration count are independent (both keyed only
  // on eventId), so overlap them rather than await back to back.
  const [event, { totalDocs }] = await Promise.all([
    payload
      .findByID({
        collection: 'events',
        id: eventId,
        depth: 0,
        select: { registrationMode: true, registrationLimit: true, registrationsFull: true },
        overrideAccess: true,
        req,
      })
      .catch(() => null),
    countActiveRegistrations({ payload, eventId, req }),
  ])
  if (!event) return

  const full = isEventFull(event, totalDocs)
  if (Boolean(event.registrationsFull) === full) return

  // Bookkeeping, so it must not re-validate the stored event: this runs in an
  // unguarded afterChange hook, and a throw kills the visitor's transaction —
  // the registration taking the last seat was refused outright (#842).
  const data: Pick<Event, 'registrationsFull'> = { registrationsFull: full }
  await updateEventBookkeeping({ payload, id: eventId, data, req })
}
