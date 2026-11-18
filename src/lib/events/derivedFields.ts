/**
 * Two Events fields a writer derives from the rest of what it writes — the pace
 * and the contact box — so every writer and the form answer alike.
 */

import { parseRecurrence, type Recurrence } from '@/lib/schedule/recurrence'
import type { Event } from '@/payload-types'

/**
 * The pace a schedule implies: its recurrence, else a one-off, else dormant —
 * no schedule at all is what a dormant class carries.
 *
 * ⚠ **Every create owes `repeats` with its schedule.** `syncScheduleRecurrence`
 * writes `schedule.recurrenceType` from `repeats`, and a create has no stored
 * pace for {@link paceAfter} to compare, so a create naming the recurrence alone
 * has it cleared. The class import and the proposal merge both derive it here.
 */
export function repeatsForSchedule(schedule: unknown): Event['repeats'] {
  if (!schedule) return 'inactive'
  const recurrence = parseRecurrence((schedule as { recurrenceType?: unknown }).recurrenceType)
  return recurrence ? (recurrence.toLowerCase() as Lowercase<Recurrence>) : 'once'
}

/** The two fields {@link paceAfter} compares. */
interface Paced {
  repeats?: Event['repeats'] | null
  schedule?: { recurrenceType?: unknown } | null
}

/**
 * The pace a write lands on over a stored class. A changed `repeats` wins. A
 * write that edits the recurrence and leaves the pace alone — an update
 * proposal, a REST patch — moves a scheduled pace with it, rather than having
 * the edit reverted; a dormant class stays dormant. `syncScheduleRecurrence`
 * applies it to every update, and the proposal merge to its preview, so the two
 * agree.
 */
export function paceAfter(stored: Paced, next: Paced): Event['repeats'] | null | undefined {
  const repeats = next.repeats ?? stored.repeats
  if (repeats !== stored.repeats || !repeats || repeats === 'inactive') return repeats
  const schedule = { ...stored.schedule, ...next.schedule }
  const recurrence = parseRecurrence(schedule.recurrenceType)
  return recurrence === parseRecurrence(stored.schedule?.recurrenceType)
    ? repeats
    : repeatsForSchedule(schedule)
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
