import type { EventQualityInput, QualitySkipReason } from './types'

/**
 * Human-readable explanation per skip reason. The panel renders this instead of
 * an empty report — "no recommendations" and "not checked because this event is
 * finished" are completely different messages to a manager.
 */
export { SKIP_REASON_COPY as SKIP_REASON_LABELS } from './copy'

/**
 * Whether the quality checks apply to this event at all, and why not.
 *
 * A listing nobody can see doesn't need grooming, and an event whose schedule
 * has run out is not going to be improved — telling its manager to add photos
 * would be noise. Returns `null` when the checks do apply.
 *
 * Ordered most-terminal first: an expired event is also unpublished, and
 * "expired" is the fact the manager can act on.
 */
export function shouldSkipQualityChecks(event: EventQualityInput): QualitySkipReason | null {
  if (event.deletedAt) return 'trashed'
  if (event.verificationStage === 'finished') return 'finished'
  if (event.verificationStage === 'expired') return 'expired'
  // Community-rejected (also unpublished) — "denied" is the actionable fact,
  // same reasoning as `expired` above. Published `unverified` events fall
  // through to `null`: user-submitted listings are exactly the ones whose
  // grooming to-do list an adopting manager wants to see.
  if (event.verificationStage === 'denied') return 'denied'
  if (event._status !== 'published') return 'unpublished'
  return null
}
