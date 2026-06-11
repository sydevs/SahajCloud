/**
 * Canonical verification-stage vocabulary, shared by the Events schema
 * (`eventOptions`), the verify hook/endpoint, the ExpireEvents job, and the
 * admin notice. Lives in the cross-cutting lib so nothing imports a stage value
 * from a collection.
 *
 * The single `verificationStage` enum consolidates both the lifecycle status
 * and the escalation step: `verified → reminded → escalated → expired`, plus
 * terminal `finished`. ("Archived" is a Payload soft-delete, not a stage.)
 */
export const VERIFICATION_STAGES = [
  'verified',
  'reminded',
  'escalated',
  'expired',
  'finished',
] as const

export type VerificationStage = (typeof VERIFICATION_STAGES)[number]

export const DEFAULT_VERIFICATION_STAGE: VerificationStage = 'verified'

/**
 * Stages where the event stays published (publicly visible). `expired` and
 * `finished` unpublish (`_status: 'draft'`); verifying restores `verified`.
 */
export const PUBLISHED_STAGES = ['verified', 'reminded', 'escalated'] as const

/** Whether an event at this stage should be published. */
export function isPublishedStage(stage: string | null | undefined): boolean {
  return (PUBLISHED_STAGES as readonly string[]).includes(stage ?? '')
}
