import type { Payload, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { notificationFrequency } from '@/components/admin/NotificationPreferences/config'
import type { LogRow } from '@/fields'
import { toLogRow } from '@/fields'
import type { ActorRef, VerificationMethod } from '@/lib/eventVerification/log'
import { buildVerificationEntry } from '@/lib/eventVerification/log'
import { EVENT_MACHINE } from '@/lib/eventVerification/machine'
import { addDays, verificationPeriodDays } from '@/lib/eventVerification/periods'
import type { VerificationStage } from '@/lib/eventVerification/stages'
import { resolveNextCheckAt } from '@/lib/eventVerification/watermark'
import { can } from '@/lib/stateMachine/machine'
import { transition } from '@/lib/stateMachine/transition'
import type { Event, Manager } from '@/payload-types'
import { readLinkToken } from '@/plugins/login'
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

/**
 * What a verify link or button answers on an event whose schedule has run out.
 *
 * A `finished` event is not re-verified in place: its last occurrence is
 * behind it, so vouching for it would re-list a class that is over. Extending
 * the schedule is the move, and that save revives *and* verifies it.
 */
export const FINISHED_REFUSAL =
  'This class has finished. Extend its schedule and save to list it again — that verifies it too.'

/** Field patch applied to an event when it's verified. */
export interface VerifyFields {
  verificationStage: 'verified'
  /**
   * Always a date in practice (the cadence deadline is the floor), but typed
   * nullable because it comes from the shared watermark rule, whose other
   * stages legitimately return null.
   */
  nextCheckAt: string | null
  /** The cycle's first row — the verification that opened it. */
  activityLog: LogRow[]
}

/** Pull the `event_verification` cadence off a (possibly unpopulated) manager. */
export function managerCadence(manager: Manager | number | null | undefined): string | undefined {
  if (!manager || typeof manager !== 'object') return undefined
  return notificationFrequency(manager.notificationPreferences, 'event_verification')
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
  /** Where this save leaves `_status`: a draft gets no reminders. */
  status?: string | null
  now: Date
}): VerifyFields {
  const { method, by, frequency, schedule, inactive, status, now } = args
  return {
    verificationStage: 'verified',
    nextCheckAt: resolveNextCheckAt({
      stage: 'verified',
      stageDeadline: addDays(now, verificationPeriodDays(frequency)),
      schedule,
      inactive,
      status,
    }),
    activityLog: [toLogRow(buildVerificationEntry(method, by, now.toISOString()))],
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

  const from = event.verificationStage as VerificationStage
  // Only `finished` is outside the table for this actor, and the answer a
  // manager needs is what to do instead: extending the schedule revives the
  // event through the save hook, which verifies it on the way (#603).
  if (!can(EVENT_MACHINE, from, 'verified', 'verify')) {
    throw new APIError(FINISHED_REFUSAL, 409, undefined, true)
  }

  const fields = computeVerifyFields({
    method,
    by,
    frequency: managerCadence(event.manager),
    schedule: event.schedule,
    inactive: event.inactive,
    // The verify action re-publishes, so the cycle it opens is a listed one.
    status: 'published',
    now,
  })

  let verified: Event | undefined
  await transition({
    payload,
    machine: EVENT_MACHINE,
    collection: 'events',
    id: eventId,
    from,
    to: 'verified',
    by: 'verify',
    // The explicit verify action re-publishes (revives an *expired* event — a
    // finished one was never unpublished, see #603); the save hook leaves
    // `_status` to the manager's save choice.
    data: { ...fields, _status: 'published' },
    context: { skipVerifyHook: true },
    req,
    // ⚠ **By id, not a claim, and the write's own result.** The claim form is a
    // `payload.update` carrying a `where`: access control narrows the selection
    // there rather than throwing, so a manager who may not update the event
    // would read as a lost race instead of a `Forbidden`, and `POST :id/verify`
    // would answer 200. Nothing slow runs between the read above and this
    // write, which is the window a claim exists to close.
    write: async ({ data, context }) => {
      verified = await payload.update({
        collection: 'events',
        id: eventId,
        data: data as never,
        context,
        // What the verify page's `webUrl` needs, and what spares this a second
        // read of the row it just wrote.
        depth: 1,
        overrideAccess,
        req,
      })
      return true
    },
  })

  return verified as Event
}

/**
 * Verify an event from a reminder's link, on the logged-out verify page.
 *
 * The link is a login-plugin page link carrying a `verifies` claim, and it is
 * the whole authorization: the event it names, for the manager it was sent to.
 * Returns the updated event (with its virtual `webUrl`), or `null` for a link
 * that is expired, invalid, carries no event, or was sent to an account that no
 * longer qualifies. `applyVerification` errors propagate to the caller.
 *
 * Only ever called from the page's form `POST` — opening the link verifies
 * nothing, so a mail scanner fetching it cannot.
 */
export async function verifyEventFromLink(args: {
  payload: Payload
  link: string
  now?: Date
}): Promise<Event | null> {
  const { payload, link, now = new Date() } = args

  const result = await readLinkToken(link, payload.secret, now)
  if (result.status !== 'valid' || result.claims.collection !== 'managers') return null
  const { userId, verifies } = result.claims
  if (verifies === undefined) return null

  const manager = await payload
    .findByID({ collection: 'managers', id: userId, depth: 0, overrideAccess: true })
    .catch(() => null)
  // Deactivated since the reminder went out: the link no longer speaks for them.
  if (!manager || manager.type === 'inactive') return null

  return applyVerification({
    payload,
    eventId: verifies,
    method: 'email-link',
    by: { id: manager.id, name: manager.name || manager.email || `#${manager.id}` },
    now,
    overrideAccess: true,
  })
}
