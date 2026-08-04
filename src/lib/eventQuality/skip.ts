import type { EventQualityInput, QualitySkipReason } from './types'

/**
 * Human-readable explanation per skip reason. The panel renders this instead of
 * an empty report — "no recommendations" and "not checked because this event is
 * finished" are completely different messages to a manager.
 */
export const SKIP_REASON_LABELS: Record<QualitySkipReason, string> = {
  trashed:
    'This event is in the trash, so its listing isn’t checked. Restore it to see recommendations.',
  finished:
    'This event’s schedule has ended, so its listing isn’t checked. Extend the end date to see recommendations.',
  expired:
    'This event expired and is hidden from the public. Republish it to verify — recommendations return once it’s listed again.',
  unpublished:
    'This event isn’t published yet, so its listing isn’t checked. Publish it to see recommendations.',
}

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
  if (event._status !== 'published') return 'unpublished'
  return null
}
