import type { CollectionBeforeChangeHook } from 'payload'

import { resolveNextCheckAt } from '@/lib/eventVerification/periods'
import { isUnmanagedStage } from '@/lib/eventVerification/stages'
import type { EventScheduleInput } from '@/types/schedule'

/**
 * Keep the `nextCheckAt` watermark current for the pre-adoption stages
 * (`unverified` / `denied`), whose only scheduled transition is finishing when
 * the schedule runs out.
 *
 * Without this the ExpireEvents job would need its own sweep to find them — and
 * the only predicate available for that (`schedule.lastDate < now`) matches
 * every event that ever ended, on every run, forever. Setting the watermark on
 * write instead keeps the job to a single, permanently cheap due-query.
 *
 * Two deliberate departures from the sibling hooks:
 *
 * - **It ignores `skipVerifyHook`.** That flag means "don't re-open the
 *   verification cycle", a decision; this hook maintains derived data, like
 *   `computeLastDate`. It matters because both paths that create an unverified
 *   event — the submission accept op and the bulk importer — set the flag, and
 *   an event created without a watermark would never finish.
 * - **It reads the merged stage**, so it stays out of the way of every other
 *   writer: an adoption that just moved the event to `verified` (verifyOnSave
 *   runs first), and the job's own `finished` write, both land on stages this
 *   hook doesn't touch.
 *
 * The schedule is merged from `{ ...originalDoc, ...data }` because collection
 * `beforeChange` hooks run *before* the field hook that writes
 * `schedule.lastDate` — the trap documented on `revivesFinishedEvent`.
 */
export const syncUnmanagedCheckAt: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const stage = (data?.verificationStage ?? originalDoc?.verificationStage) as string | undefined
  if (!isUnmanagedStage(stage)) return data

  const original = originalDoc?.schedule as EventScheduleInput | null | undefined
  const incoming = data?.schedule as EventScheduleInput | null | undefined
  const schedule =
    !incoming && !original ? null : ({ ...original, ...incoming } as EventScheduleInput)

  return {
    ...data,
    nextCheckAt: resolveNextCheckAt({
      stage: 'unverified',
      schedule,
      inactive: (data?.inactive ?? originalDoc?.inactive) as boolean | null | undefined,
    }),
  }
}
