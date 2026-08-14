import type { EventQualityInput, QualitySkipReason } from './types'

import { isDormantStage } from '@/lib/eventVerification/stages'

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
  // A listing that's off the map or finished has nothing worth grooming, and
  // the stage name is exactly the reason to show. Derived from the stage's
  // declared attention rather than an if-chain, so a new terminal stage is
  // covered by declaring it — see `isDormantStage`.
  if (isDormantStage(event.verificationStage)) {
    return event.verificationStage as QualitySkipReason
  }
  if (event._status !== 'published') return 'unpublished'
  return null
}
