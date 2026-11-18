import type { CollectionBeforeValidateHook } from 'payload'

import { recurrenceForRepeats } from '@/fields/scheduleFields'
import type { Event } from '@/payload-types'

/**
 * Write `schedule.recurrenceType` from `repeats`, the one control an editor
 * sees for both concepts.
 *
 * ⚠ **`repeats` is the authority, so every writer sets it** — the class import
 * and the proposal merge go through `newEventDefaults`, which derives it from
 * the schedule they build. A writer that sets `recurrenceType` alone has it
 * cleared here.
 *
 * `beforeValidate`, so the schedule's own field hooks — `computeIcalRule`,
 * `computeLastDate` — see the value on the same save. A dormant class keeps the
 * recurrence it had: its schedule is hidden, not cleared, so choosing a pace
 * again restores it.
 */
export const syncScheduleRecurrence: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data) return data
  const repeats = (data.repeats ?? originalDoc?.repeats) as Event['repeats'] | null | undefined
  if (!repeats || repeats === 'inactive') return data

  const recurrenceType = recurrenceForRepeats(repeats) ?? null
  // Left alone where it already agrees, so an unrelated save — a bookkeeping
  // write, a registration recount — patches no schedule column. Merged the way
  // `mergedSchedule` does next door: a patch naming one sub-field alone leaves
  // the rest stored.
  const schedule = { ...(originalDoc?.schedule as object), ...(data.schedule as object) } as Record<
    string,
    unknown
  >
  if ((schedule.recurrenceType ?? null) === recurrenceType) return data

  return { ...data, schedule: { ...((data.schedule ?? {}) as object), recurrenceType } }
}
