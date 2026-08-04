import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { syncEventRegistrationsFull } from '@/lib/registrations/fullness'
import { relationId } from '@/lib/utilities/relationId'

/**
 * Keep the owning event's denormalized `registrationsFull` flag in step after a
 * registration changes. A create can push the event to capacity; a re-assignment
 * to a different event frees a spot on the old one and may fill the new one. The
 * recompute writes only on a real flip (see `syncEventRegistrationsFull`).
 */
export const syncFullnessAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  const eventId = relationId(doc.event)
  if (eventId != null) {
    await syncEventRegistrationsFull({ payload: req.payload, eventId, req })
  }
  // A moved registration frees a spot on its previous event too.
  if (operation === 'update') {
    const previousEventId = relationId(previousDoc?.event)
    if (previousEventId != null && previousEventId !== eventId) {
      await syncEventRegistrationsFull({ payload: req.payload, eventId: previousEventId, req })
    }
  }
  return doc
}

/** Free the owning event's capacity flag after a registration is deleted. */
export const syncFullnessAfterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const eventId = relationId(doc.event)
  if (eventId != null) {
    await syncEventRegistrationsFull({ payload: req.payload, eventId, req })
  }
  return doc
}
