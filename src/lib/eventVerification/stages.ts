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
 */
export const VERIFICATION_STAGES = [
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
  Exclude<VerificationStage, 'expired' | 'finished'>,
  number
> = {
  verified: 7,
  reminded: 7,
  escalated: 7,
  urgent: 14,
}

/**
 * Stages where the event stays published. Only `expired` unpublishes
 * (`_status: 'draft'`); verifying restores `verified`.
 *
 * `finished` is a **published** stage (#603): its Atlas page must keep resolving
 * for a late seeker following an old link, so nothing unpublishes on the
 * finished path. Published ≠ publicly listed — a finished event is filtered out
 * of the map and list feeds by `notFinishedWhere`
 * (`@/collections/Events/lifecycle/finished`), not by being unpublished.
 */
export const PUBLISHED_STAGES = ['verified', 'reminded', 'escalated', 'urgent', 'finished'] as const

/** Whether an event at this stage should be published. */
export function isPublishedStage(stage: string | null | undefined): boolean {
  return (PUBLISHED_STAGES as readonly string[]).includes(stage ?? '')
}
