import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { syncEventRegistrationsFull } from '@/lib/registrations/fullness'
import { relationId } from '@/lib/utilities/relationId'

/**
 * ⚠ **Temporary, and deleted with this collection by #800.**
 *
 * The real fullness hooks moved to `user-submissions` with #797. These two
 * exist only because `POST /api/events/{id}/register` still writes here until
 * #800, and the Atlas widget still posts there until sydevs/SahajAtlasWeb#195
 * — so a seat taken through the live path must still flip the event's
 * `registrationsFull` flag. `countActiveRegistrations` sums both tables for
 * the same window; this is the other half of that bridge.
 *
 * Deliberately thin wrappers rather than the `user-submissions` hooks reused:
 * those guard on `doc.type === 'registration'`, a column no row here has.
 */
export const syncLegacyFullnessAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  const eventId = relationId(doc.event)
  if (eventId != null) await syncEventRegistrationsFull({ payload: req.payload, eventId, req })
  if (operation === 'update') {
    const previousEventId = relationId(previousDoc?.event)
    if (previousEventId != null && previousEventId !== eventId) {
      await syncEventRegistrationsFull({ payload: req.payload, eventId: previousEventId, req })
    }
  }
  return doc
}

export const syncLegacyFullnessAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const eventId = relationId(doc.event)
  if (eventId != null) await syncEventRegistrationsFull({ payload: req.payload, eventId, req })
  return doc
}
