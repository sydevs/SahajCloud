/**
 * Select-option arrays for the Events collection enums.
 *
 * Values mirror the legacy Atlas source enums the #605 migration imported:
 * Rails STI / integer enums / Ruby bitmasks are remapped to these strings by
 * the Phase 3 importer.
 */

import type { VerificationStage } from '@/lib/eventVerification/stages'

export const EVENT_TYPE_OPTIONS = [
  { label: 'Offline', value: 'offline' },
  { label: 'Online', value: 'online' },
] as const

/** What each verification stage is called in the admin. */
export const VERIFICATION_STAGE_LABELS: Record<VerificationStage, string> = {
  unverified: 'Unverified',
  denied: 'Denied',
  verified: 'Verified',
  reminded: 'Reminded',
  escalated: 'Escalated',
  urgent: 'Urgent',
  expired: 'Expired',
  finished: 'Finished',
}

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
 * How often a class meets, plus the dormant state — one control, because an
 * editor is choosing one thing. `once` stores no recurrence; `inactive` leaves
 * the recurrence alone, so choosing a pace again restores the schedule.
 */
export const EVENT_REPEATS_OPTIONS = [
  { label: "Doesn't repeat", value: 'once' },
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Inactive', value: 'inactive' },
] as const
