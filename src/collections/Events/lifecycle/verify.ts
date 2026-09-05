import type { Payload, PayloadRequest } from 'payload'

import type { ActorRef, VerificationMethod } from '@/lib/eventVerification/log'
import { buildVerificationEntry } from '@/lib/eventVerification/log'
import { addDays, verificationPeriodDays } from '@/lib/eventVerification/periods'
import { verifyVerifyToken } from '@/lib/eventVerification/token'
import { resolveNextCheckAt } from '@/lib/eventVerification/watermark'
import type { Event, Manager } from '@/payload-types'
import type { EventSchedule } from '@/types/schedule'

/**
 * Shared "verify" semantics used by both verify paths (the save hook and the
 * explicit endpoint). Opening a fresh cycle means: stage → `verified`,
 * `nextCheckAt` = now + the manager's cadence, and `activityLog` reset to a
 * single `verification` first entry recording who verified and how.
 *
 * Re-publishing (`_status: 'published'`) is NOT part of this patch: the save
 * hook merges it into whatever the manager is saving, so forcing publish there
 * would override a deliberate "Save Draft" (and fail validation on an
 * incomplete draft). The explicit verify endpoints re-publish on top of this
 * patch — that's the path that revives an unpublished event.
 */

/** Field patch applied to an event when it's verified. */
export interface VerifyFields {
  verificationStage: 'verified'
  /**
   * Always a date in practice (the cadence deadline is the floor), but typed
   * nullable because it comes from the shared watermark rule, whose other
   * stages legitimately return null.
   */
  nextCheckAt: string | null
  activityLog: ReturnType<typeof buildVerificationEntry>[]
}

/** Pull the `event_verification` cadence off a (possibly unpopulated) manager. */
export function managerCadence(manager: Manager | number | null | undefined): string | undefined {
  if (!manager || typeof manager !== 'object') return undefined
  return manager.notificationPreferences?.event_verification?.frequency
}

/** Build a log actor reference from the acting user (a manager). */
export function actorFromUser(user: PayloadRequest['user']): ActorRef | null {
  if (!user || user.collection !== 'managers') return null
  const manager = user as { id: number; name?: string | null; email?: string | null }
  return { id: manager.id, name: manager.name || manager.email || `#${manager.id}` }
}

/**
 * Compute the verify field patch. Pure — the cadence, schedule + clock are
 * inputs.
 *
 * `nextCheckAt` goes through `resolveNextCheckAt`, so the cadence is capped by
 * the schedule's end: an event whose last occurrence falls inside the
 * verification window is finished the day after it happens rather than sitting
 * as "verified" until the next reminder is due (up to 6 months later).
 */
export function computeVerifyFields(args: {
  method: VerificationMethod
  by: ActorRef | null
  frequency?: string | null
  /** The event's schedule, so the watermark can't outrun its last occurrence. */
  schedule?: Partial<EventSchedule> | null
  inactive?: boolean | null
  now: Date
}): VerifyFields {
  const { method, by, frequency, schedule, inactive, now } = args
  return {
    verificationStage: 'verified',
    nextCheckAt: resolveNextCheckAt({
      stage: 'verified',
      stageDeadline: addDays(now, verificationPeriodDays(frequency)),
      schedule,
      inactive,
    }),
    activityLog: [buildVerificationEntry(method, by, now.toISOString())],
  }
}

/**
 * Run the verify op against an event by id: load it (for the manager's
 * cadence), then write the verified fields with `skipVerifyHook` so it doesn't
 * re-trip the save hook. Used by the explicit verify endpoints.
 *
 * `overrideAccess` gates the write: `false` for the logged-in admin action
 * (enforces the user's update access via the access plugin), `true` for the
 * tokenized email link (the signed token is the authorization).
 */
export async function applyVerification(args: {
  payload: Payload
  eventId: number
  method: VerificationMethod
  by: ActorRef | null
  now?: Date
  req?: PayloadRequest
  overrideAccess?: boolean
}): Promise<Event> {
  const { payload, eventId, method, by, now = new Date(), req, overrideAccess = true } = args

  const event = await payload.findByID({
    collection: 'events',
    id: eventId,
    depth: 1,
    overrideAccess: true,
    req,
  })

  const fields = computeVerifyFields({
    method,
    by,
    frequency: managerCadence(event.manager),
    schedule: event.schedule,
    inactive: event.inactive,
    now,
  })

  return payload.update({
    collection: 'events',
    id: eventId,
    // The explicit verify action re-publishes (revives an *expired* event — a
    // finished one was never unpublished, see #603); the save hook leaves
    // `_status` to the manager's save choice.
    data: { ...fields, _status: 'published' },
    context: { skipVerifyHook: true },
    overrideAccess,
    req,
  })
}

/**
 * Verify an event from a tokenized email link (the logged-out path). Validates
 * the signed token, resolves the manager's display name for the log, and runs
 * the shared verify op with `overrideAccess: true` (the token is the
 * authorization). Returns the updated event (carries the virtual `webUrl`), or
 * `null` when the token is missing/expired/invalid. `applyVerification` errors
 * propagate to the caller.
 *
 * Kept out of the route/action layer so it's testable with a plain `payload`
 * instance — the Server Action is a thin `getPayload` wrapper around this.
 */
export async function verifyEventFromToken(args: {
  payload: Payload
  token: string
  now?: Date
}): Promise<Event | null> {
  const { payload, token, now = new Date() } = args

  const claims = await verifyVerifyToken(token, payload.secret, now)
  if (!claims) return null

  // Resolve the manager's display name for the log's `by` entry.
  const manager = await payload
    .findByID({ collection: 'managers', id: claims.managerId, depth: 0, overrideAccess: true })
    .catch(() => null)
  const name = manager?.name || manager?.email || `#${claims.managerId}`

  return applyVerification({
    payload,
    eventId: claims.eventId,
    method: 'email-link',
    by: { id: claims.managerId, name },
    now,
    overrideAccess: true,
  })
}
