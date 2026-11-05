/**
 * Whether an Atlas listing is inactive with nobody to reach. An inactive event
 * has no schedule, so a person is the only way in, and Events refuses one with
 * neither a phone nor an email (`contactPhone`'s validate). Atlas holds such
 * rows — a dormant listing whose only contact is a Meetup page — so the
 * importer parks them as drafts a manager can complete and publish.
 */
export function isUnreachableInactive(event: {
  category: string | null
  contactInfo?: { phone_number?: string | null } | null
  contactEmail?: string | null
}): boolean {
  return (
    event.category === 'inactive' &&
    !event.contactInfo?.phone_number?.trim() &&
    !event.contactEmail?.trim()
  )
}
