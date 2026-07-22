import type { Payload, PayloadRequest } from 'payload'

import { asTrustedReq } from '@/plugins/usage/hooks'

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
 * Recompute an event's denormalized `registrationsFull` flag from a live
 * registration count and persist it — only when it actually flips. Called from
 * the Registrations create/delete hooks so the flag the Atlas widget reads stays
 * O(1) on the feed (no per-event COUNT at read time).
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
  // client user. Elevate it to a trusted req: the client query gate would
  // otherwise reject the nested `regions` find the event update runs to
  // re-validate `region` via filterOptions (a client find with no `select`).
  // overrideAccess still covers permissions.
  const req = args.req ? asTrustedReq(args.req) : undefined

  const event = await payload
    .findByID({
      collection: 'events',
      id: eventId,
      depth: 0,
      select: { registrationMode: true, registrationLimit: true, registrationsFull: true },
      overrideAccess: true,
      req,
    })
    .catch(() => null)
  if (!event) return

  const { totalDocs } = await payload.count({
    collection: 'registrations',
    where: { event: { equals: eventId } },
    overrideAccess: true,
    req,
  })

  const full = isEventFull(event, totalDocs)
  if (Boolean(event.registrationsFull) === full) return

  await payload.update({
    collection: 'events',
    id: eventId,
    data: { registrationsFull: full },
    // skipVerifyHook (don't re-open verification) alongside the trusted-req skip
    // flag — spread req.context so the trusted flag survives if the context arg
    // replaces rather than merges.
    context: { ...(req?.context ?? {}), skipVerifyHook: true },
    overrideAccess: true,
    req,
  })
}
