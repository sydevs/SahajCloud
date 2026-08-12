/**
 * Canonical verification-stage vocabulary, shared by the Events schema
 * (`eventOptions`), the verify hook/endpoint, the ExpireEvents job, and the
 * admin notice. Lives in the cross-cutting lib so nothing imports a stage value
 * from a collection.
 *
 * The single `verificationStage` enum consolidates both the lifecycle status
 * and the escalation step: `verified → reminded → escalated → urgent → expired`,
 * plus terminal `finished`. Each pre-expiry stage marks the last reminder sent
 * (reminded = due, escalated, urgent = final). ("Archived" is a Payload
 * soft-delete, not a stage.)
 *
 * Two stages sit *before* the reminder ladder — both have no manager, keep
 * `nextCheckAt: null`, and are therefore invisible to the ExpireEvents sweep.
 * Assigning a manager and saving (adoption) is the only exit from either:
 *
 * - `unverified` — imported or accepted from a public submission; published so
 *   it appears on the map, badged client-side, and open to registrant
 *   confirm/deny voting.
 * - `denied` — community-rejected (the vote-sync hook's denial threshold);
 *   unpublished (`_status: 'draft'`) and closed to further voting.
 */
export const VERIFICATION_STAGES = [
  'unverified',
  'denied',
  'verified',
  'reminded',
  'escalated',
  'urgent',
  'expired',
  'finished',
] as const

export type VerificationStage = (typeof VERIFICATION_STAGES)[number]

export const DEFAULT_VERIFICATION_STAGE: VerificationStage = 'verified'

/**
 * Days an event sits at a stage before the ExpireEvents job advances it to the
 * next. Single source of truth for the stage machine's transition offsets and
 * for projecting upcoming stage dates in the admin stepper. `expired` (→ trash)
 * and `finished` have no fixed offset, so they're omitted.
 */
export const STAGE_DURATION_DAYS: Record<
  Exclude<VerificationStage, 'unverified' | 'denied' | 'expired' | 'finished'>,
  number
> = {
  verified: 7,
  reminded: 7,
  escalated: 7,
  urgent: 14,
}

/**
 * Stages where the event stays published. Only `expired` and `denied`
 * unpublish (`_status: 'draft'`); verifying restores `verified`.
 *
 * `finished` is a **published** stage (#603): its Atlas page must keep resolving
 * for a late seeker following an old link, so nothing unpublishes on the
 * finished path. Published ≠ publicly listed — a finished event is filtered out
 * of the map and list feeds by `notFinishedWhere`
 * (`@/collections/Events/lifecycle/finished`), not by being unpublished.
 *
 * `unverified` is published too — the whole point is showing the listing so
 * the community can vouch for it; the client badges it from `verificationStage`.
 */
export const PUBLISHED_STAGES = [
  'unverified',
  'verified',
  'reminded',
  'escalated',
  'urgent',
  'finished',
] as const

/** Whether an event at this stage should be published. */
export function isPublishedStage(stage: string | null | undefined): boolean {
  return (PUBLISHED_STAGES as readonly string[]).includes(stage ?? '')
}

/**
 * The pre-adoption stages — no manager, `nextCheckAt: null`, invisible to the
 * ExpireEvents reminder ladder. Everywhere else a manager is mandatory:
 * `verified` (and every ladder stage) always implies one.
 */
export const UNMANAGED_STAGES = ['unverified', 'denied'] as const

/** Whether an event at this stage is allowed to have no manager. */
export function isUnmanagedStage(stage: string | null | undefined): boolean {
  return (UNMANAGED_STAGES as readonly string[]).includes(stage ?? '')
}
