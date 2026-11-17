import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Clear the contact details when the editor switches them off.
 *
 * ⚠ **A hidden field keeps its value.** `admin.condition` stops the three
 * fields rendering, not the columns holding what was typed before — and the
 * Atlas widget reads `contactPhone`, so an unchecked box would still publish a
 * number nobody meant to offer.
 *
 * It patches nothing where there is nothing to clear, so a bookkeeping write —
 * which deliberately carries three fields and skips validation — stays narrow.
 */
export const clearContactDetails: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data.allowContact ?? originalDoc?.allowContact) return data
  const merged = { ...originalDoc, ...data }
  if (!merged.contactEmail && !merged.contactName && !merged.contactPhone) return data
  return { ...data, contactEmail: null, contactName: null, contactPhone: null }
}
