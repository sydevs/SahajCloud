import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Whether a patch carries a contact route, which is what the box allows — a
 * name alone reaches nobody. Every writer of a contact field reads this, so the
 * box and the fields it gates cannot disagree.
 */
export function hasContactRoute(patch: {
  contactEmail?: unknown
  contactPhone?: unknown
}): boolean {
  return Boolean(patch.contactPhone || patch.contactEmail)
}

/**
 * Clear the contact details on the save that switches them off.
 *
 * ⚠ **A hidden field keeps its value.** `admin.condition` stops the three
 * fields rendering, not the columns holding what was typed before — and the
 * Atlas widget reads `contactPhone`, so an unchecked box would still publish a
 * number nobody meant to offer.
 *
 * It is the **transition** that clears, never the state: a partial write naming
 * a phone and no box is a caller's intent, and discarding it silently would
 * lose a write rather than tidy one.
 */
export const clearContactDetails: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data.allowContact !== false || !originalDoc?.allowContact) return data
  return { ...data, contactEmail: null, contactName: null, contactPhone: null }
}
