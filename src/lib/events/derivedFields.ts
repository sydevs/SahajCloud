/**
 * Two Events fields a writer derives from the rest of what it writes, rather
 * than taking from its input, so every writer and the form answer alike.
 */

import { parseRecurrence, type Recurrence } from '@/lib/schedule/recurrence'
import type { Event } from '@/payload-types'

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
  const recurrence = parseRecurrence((schedule as { recurrenceType?: unknown }).recurrenceType)
  return recurrence ? (recurrence.toLowerCase() as Lowercase<Recurrence>) : 'once'
}

/**
 * Whether a patch carries a contact route — a phone or an email, since a name
 * alone reaches nobody. It is what `allowContact` allows, what an on-demand
 * class must carry, and what the Schedule tab's banner reports.
 */
export function hasContactRoute(patch: {
  contactEmail?: unknown
  contactPhone?: unknown
}): boolean {
  return Boolean(patch.contactPhone || patch.contactEmail)
}
