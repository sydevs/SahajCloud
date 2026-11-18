import type { CollectionBeforeValidateHook } from 'payload'

import { parseRecurrence } from '@/lib/schedule/recurrence'
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
  const repeats: Event['repeats'] | null | undefined = data.repeats ?? originalDoc?.repeats
  if (!repeats || repeats === 'inactive') return data

  const recurrenceType = parseRecurrence(repeats) ?? null
  // Left alone where the schedule this save lands on already agrees, so an
  // unrelated save — a bookkeeping write, a registration recount — patches no
  // schedule column.
  const stored = { ...originalDoc?.schedule, ...data.schedule }.recurrenceType ?? null
  if (stored === recurrenceType) return data

  return { ...data, schedule: { ...data.schedule, recurrenceType } }
}
