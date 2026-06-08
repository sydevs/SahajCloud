/**
 * Select-option arrays for the Events collection enums, kept in their own
 * module so both the collection config and the virtual-title hook can import
 * them without a circular dependency.
 *
 * Values mirror the Atlas source enums (see seeds/atlas/MIGRATION_PLAN.md):
 * Rails STI / integer enums / Ruby bitmasks are remapped to these strings by
 * the Phase 3 importer.
 */

export const EVENT_TYPE_OPTIONS = [
  { label: 'Offline', value: 'offline' },
  { label: 'Online', value: 'online' },
] as const

export const EVENT_CATEGORY_OPTIONS = [
  { label: 'Drop-in', value: 'dropin' },
  { label: 'Single', value: 'single' },
  { label: 'Course', value: 'course' },
  { label: 'Festival', value: 'festival' },
  { label: 'Concert', value: 'concert' },
] as const

export const EVENT_STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Expired', value: 'expired' },
  { label: 'Inactive', value: 'inactive' },
] as const

export const EVENT_REGISTRATION_MODE_OPTIONS = [
  { label: 'Native', value: 'native' },
  { label: 'External', value: 'external' },
  { label: 'Meetup', value: 'meetup' },
  { label: 'Eventbrite', value: 'eventbrite' },
  { label: 'Facebook', value: 'facebook' },
] as const

export const EVENT_REGISTRATION_NOTIFICATION_OPTIONS = [
  { label: 'Digest', value: 'digest' },
  { label: 'Immediate', value: 'immediate' },
  { label: 'Disabled', value: 'disabled' },
] as const

export const EVENT_REGISTRATION_QUESTION_OPTIONS = [
  { label: 'Questions', value: 'questions' },
  { label: 'Experience', value: 'experience' },
  { label: 'Aspirations', value: 'aspirations' },
  { label: 'Referral', value: 'referral' },
] as const
