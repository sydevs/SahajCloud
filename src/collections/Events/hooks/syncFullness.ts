import type { CollectionBeforeChangeHook } from 'payload'

import { isEventFull } from '@/lib/registrations/fullness'

/**
 * Keep the denormalized `registrationsFull` flag correct when a manager edits an
 * event's capacity. Registration create/delete keeps the flag in step with the
 * count (`syncEventRegistrationsFull`); this covers the other input — a change
 * to `registrationMode` / `registrationLimit`:
 *
 * - A non-atlas or blank-limit (unlimited) event can never be full → clear it
 *   without a query.
 * - A brand-new event has no registrations yet → derive from a count of 0.
 * - Otherwise recompute from a live count, but only when the capacity actually
 *   changed (a save that leaves mode + limit untouched skips the query, so
 *   system writes of `registrationsFull` itself don't recurse into a count).
 *
 * Sets the flag inline in the outgoing `data` — no extra write or version. Uses
 * `'field' in data` rather than `??` so clearing the limit (an explicit `null`)
 * is distinguished from leaving it untouched (absent).
 */
export const syncEventFullness: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const registrationMode =
    'registrationMode' in data ? data.registrationMode : originalDoc?.registrationMode
  const registrationLimit =
    'registrationLimit' in data ? data.registrationLimit : originalDoc?.registrationLimit
  const capacity = { registrationMode, registrationLimit }

  // Can never be full — no count needed.
  if (registrationMode !== 'sahaj-atlas' || registrationLimit == null) {
    data.registrationsFull = false
    return data
  }

  // No registrations exist yet on a create.
  if (operation === 'create' || originalDoc?.id == null) {
    data.registrationsFull = isEventFull(capacity, 0)
    return data
  }

  // Only pay for a count when the capacity actually changed.
  const capacityChanged =
    registrationMode !== originalDoc?.registrationMode ||
    registrationLimit !== originalDoc?.registrationLimit
  if (!capacityChanged) return data

  const { totalDocs } = await req.payload.count({
    collection: 'registrations',
    where: { event: { equals: originalDoc.id } },
    overrideAccess: true,
    req,
  })
  data.registrationsFull = isEventFull(capacity, totalDocs)
  return data
}
