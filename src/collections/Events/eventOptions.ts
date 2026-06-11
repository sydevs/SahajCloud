/**
 * Select-option arrays for the Events collection enums.
 *
 * Values mirror the Atlas source enums (see seeds/atlas/MIGRATION_PLAN.md):
 * Rails STI / integer enums / Ruby bitmasks are remapped to these strings by
 * the Phase 3 importer.
 */

export const EVENT_TYPE_OPTIONS = [
  { label: 'Offline', value: 'offline' },
  { label: 'Online', value: 'online' },
] as const

export const EVENT_STATUS_OPTIONS = [
  { label: 'Active', value: 'active' },
  { label: 'Expired', value: 'expired' },
  { label: 'Inactive', value: 'inactive' },
] as const

/**
 * Where registrants sign up. `sahaj-atlas` = handled natively in the Atlas app
 * (registrations stored here); `external` = any third-party link (Meetup,
 * Eventbrite, Facebook, etc. all collapse into this).
 */
export const EVENT_REGISTRATION_MODE_OPTIONS = [
  { label: 'Sahaj Atlas', value: 'sahaj-atlas' },
  { label: 'External', value: 'external' },
] as const

/**
 * Optional questions an event can ask registrants. Rendered as a group of
 * checkboxes on the Event (each label IS the question shown to the registrant);
 * checking one includes that question on the registration form. Placeholder
 * wording — refine per the real registration flow.
 */
export const EVENT_REGISTRATION_QUESTIONS = [
  { name: 'priorExperience', label: 'Have you practised Sahaja Yoga meditation before?' },
  { name: 'referralSource', label: 'How did you hear about this event?' },
  { name: 'healthInfo', label: 'Is there anything about your health we should know?' },
  { name: 'accessibility', label: 'Do you have any accessibility requirements?' },
  { name: 'guests', label: 'Will you be bringing any guests?' },
] as const
