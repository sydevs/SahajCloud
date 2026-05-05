import { Temporal } from '@js-temporal/polyfill'

import { buildRRuleTemporal } from '@/hooks/scheduleHooks'
import type { ScheduleSubFields } from '@/types/schedule'

/**
 * Returns true if `now` falls within an active window of the given schedule.
 *
 * Each occurrence defines a window: [occurrenceStart, occurrenceStart + duration).
 * Duration is derived from the time-of-day delta between `firstDate` and `endTime`
 * (both stored as ISO datetime strings). If `endTime` is absent or the delta is
 * zero/negative, a default 1-hour window is used.
 *
 * To find occurrences that are "currently active", we search the range
 * [now − duration, now] — any occurrence that started in that window and
 * whose window extends to `now` is active.
 */
export function isScheduleActiveNow({
  schedule,
  now,
}: {
  schedule: Partial<ScheduleSubFields> | null | undefined
  now: Date
}): boolean {
  if (!schedule?.firstDate) return false

  const rule = buildRRuleTemporal(schedule)
  if (!rule) return false

  const timezone = schedule.firstDate_tz || 'UTC'

  // Compute duration of each occurrence window
  let durationMs = 60 * 60 * 1000 // default 1 hour
  if (schedule.endTime) {
    try {
      const startInTz = Temporal.Instant.from(schedule.firstDate).toZonedDateTimeISO(timezone)
      const endInTz = Temporal.Instant.from(schedule.endTime).toZonedDateTimeISO(timezone)
      const startMinutes = startInTz.hour * 60 + startInTz.minute
      let endMinutes = endInTz.hour * 60 + endInTz.minute
      if (endMinutes <= startMinutes) endMinutes += 24 * 60 // overnight event
      const delta = endMinutes - startMinutes
      if (delta > 0) durationMs = delta * 60 * 1000
    } catch {
      // keep default 1 hour
    }
  }

  // Search for occurrences that started within [now − duration, now]
  const searchStart = new Date(now.getTime() - durationMs)
  const occurrences = rule.between(searchStart, now, true)

  const nowMs = now.getTime()
  for (const occ of occurrences) {
    const occMs = Number(occ.epochMilliseconds) // BigInt → number
    if (nowMs >= occMs && nowMs < occMs + durationMs) return true
  }

  return false
}
