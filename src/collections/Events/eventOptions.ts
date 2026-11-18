/**
 * Select-option arrays for the Events collection enums.
 *
 * Values mirror the legacy Atlas source enums the #605 migration imported:
 * Rails STI / integer enums / Ruby bitmasks are remapped to these strings by
 * the Phase 3 importer.
 */

import { RECURRENCE_OPTIONS } from '@/fields/scheduleFields'
import type { VerificationStage } from '@/lib/eventVerification/stages'
import type { Event } from '@/payload-types'

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
 *
 * The paces are **derived** from the schedule field's own, so a frequency added
 * there reaches this control too, and `recurrenceForRepeats` keeps resolving
 * the lowercase spelling.
 */
export const EVENT_REPEATS_OPTIONS = [
  { label: "Doesn't repeat", value: 'once' },
  ...RECURRENCE_OPTIONS.map(({ label, value }) => ({ label, value: value.toLowerCase() })),
  { label: 'Inactive', value: 'inactive' },
]

/**
 * The pace a schedule implies: its recurrence, else a one-off, else dormant —
 * no schedule at all is what a dormant class carries.
 *
 * ⚠ **Every writer of a schedule owes `repeats` with it.**
 * `syncScheduleRecurrence` writes `schedule.recurrenceType` from `repeats`, so
 * a writer naming the recurrence alone has it cleared. The class import and the
 * proposal merge both derive it here.
 */
export function repeatsForSchedule(schedule: unknown): Event['repeats'] {
  if (!schedule) return 'inactive'
  const recurrence = (schedule as { recurrenceType?: string | null }).recurrenceType
  return recurrence ? (recurrence.toLowerCase() as Event['repeats']) : 'once'
}
