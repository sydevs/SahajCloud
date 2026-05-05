import { Temporal } from '@js-temporal/polyfill'

export const DAYTIME_START_HOUR = 8
export const DAYTIME_END_HOUR = 22

/**
 * Returns true if a stored event time (in its editor-set timezone) falls
 * within the user's daytime window (08:00–22:00 local) when evaluated
 * against the user's current timezone.
 *
 * Algorithm:
 * 1. Extract the time-of-day (HH:MM) from `eventTime` as stored in `eventTimeTz`.
 * 2. Combine it with today's calendar date in `eventTimeTz` (derived from `now`)
 *    to get the event's instant for today.
 * 3. Convert that instant into `userTimezone`.
 * 4. Pass if the resulting local hour is in [DAYTIME_START_HOUR, DAYTIME_END_HOUR).
 *
 * Using "today in the event timezone" (not UTC) keeps calendar dates correct
 * near the dateline and handles DST automatically at evaluation time.
 */
export function isEventInUserDaytime({
  eventTime,
  eventTimeTz,
  userTimezone,
  now,
}: {
  eventTime: string
  eventTimeTz: string
  userTimezone: string
  now: Temporal.Instant
}): boolean {
  try {
    // Extract the stored time-of-day components in the event timezone
    const storedInEventTz = Temporal.Instant.from(eventTime).toZonedDateTimeISO(eventTimeTz)

    // Build "today at stored HH:MM in eventTimeTz"
    const todayEventInstant = now
      .toZonedDateTimeISO(eventTimeTz)
      .with({
        hour: storedInEventTz.hour,
        minute: storedInEventTz.minute,
        second: 0,
        millisecond: 0,
        microsecond: 0,
        nanosecond: 0,
      })
      .toInstant()

    const inUserTz = todayEventInstant.toZonedDateTimeISO(userTimezone)
    return inUserTz.hour >= DAYTIME_START_HOUR && inUserTz.hour < DAYTIME_END_HOUR
  } catch {
    return false
  }
}
