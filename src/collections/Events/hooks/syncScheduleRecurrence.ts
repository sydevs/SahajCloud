import type { CollectionBeforeValidateHook } from 'payload'

import { paceAfter } from '@/lib/events/derivedFields'
import { parseRecurrence } from '@/lib/schedule/recurrence'

/**
 * Keep `repeats` and `schedule.recurrenceType` in step. On an update the pace
 * is {@link paceAfter}'s, and its recurrence is written into the schedule.
 * Payload fills every field a patch omits from the stored document before this
 * runs, so a value the write did not send reads as unchanged.
 *
 * `beforeValidate`, so the schedule's own field hooks — `computeIcalRule`,
 * `computeLastDate` — see the value on the same save. A dormant class keeps the
 * recurrence it had: its schedule is hidden, not cleared, so choosing a pace
 * again restores it.
 */
export const syncScheduleRecurrence: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data) return data
  const repeats = originalDoc ? paceAfter(originalDoc, data) : data.repeats
  const paced = repeats === data.repeats ? data : { ...data, repeats }
  if (!repeats || repeats === 'inactive') return paced

  // Left alone where the schedule already agrees, so an unrelated save — a
  // bookkeeping write, a registration recount — patches no schedule column.
  const recurrenceType = parseRecurrence(repeats) ?? null
  const current = parseRecurrence({ ...originalDoc?.schedule, ...data.schedule }.recurrenceType)
  if ((current ?? null) === recurrenceType) return paced
  return { ...paced, schedule: { ...data.schedule, recurrenceType } }
}
