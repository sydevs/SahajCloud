/**
 * Select-option arrays for the Events collection enums.
 *
 * Values mirror the legacy Atlas source enums the #605 migration imported:
 * Rails STI / integer enums / Ruby bitmasks are remapped to these strings by
 * the Phase 3 importer.
 */

import type { VerificationStage } from '@/lib/eventVerification/stages'
import { RECURRENCE_OPTIONS } from '@/lib/schedule/recurrence'
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
 * An editor reads `inactive` as **On-demand**: a class with no fixed schedule
 * that seekers arrange by getting in touch. The stored value keeps its old
 * name, because the API publishes `inactive` (see the `inactive` field).
 *
 * ⚠ **This list is the `enum_events_repeats` column**, so a frequency added to
 * `RECURRENCE_OPTIONS` moves a pinned Postgres enum and owes a migration. The
 * annotation is what says so: a pace outside `Event['repeats']` fails `tsc`
 * until `generate:types` has run, which is the point at which the column moved.
 */
export const EVENT_REPEATS_OPTIONS: readonly { label: string; value: Event['repeats'] }[] = [
  { label: 'One-time', value: 'once' },
  ...RECURRENCE_OPTIONS.map(({ label, value }) => ({
    label,
    value: value.toLowerCase() as Lowercase<typeof value>,
  })),
  { label: 'On-demand', value: 'inactive' },
]

/**
 * What each choice means, shown under the control as it changes
 * (`SelectDescription`). Keyed by the column's own type, so a pace added to it
 * is a build error here until it is described.
 */
export const EVENT_REPEATS_DESCRIPTIONS: Record<Event['repeats'], string> = {
  once: 'Meets a single time, on the date below.',
  daily: 'Meets every day, or every few days.',
  weekly: 'Meets on the same days each week, or every few weeks.',
  monthly: 'Meets once a month, on a set date or weekday.',
  inactive:
    'No fixed schedule. The listing invites seekers to get in touch through the public contact on the Details tab, and a time is arranged with them.',
}
