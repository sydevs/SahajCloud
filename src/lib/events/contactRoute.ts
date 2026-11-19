/**
 * Whether a patch carries a contact route — a phone or an email, since a name
 * alone reaches nobody. It is what `allowContact` allows, what an on-demand
 * class must carry, and what the Schedule tab's banner reports, so every writer
 * of a contact and the form answer alike.
 */
export function hasContactRoute(patch: {
  contactEmail?: unknown
  contactPhone?: unknown
}): boolean {
  return Boolean(patch.contactPhone || patch.contactEmail)
}
