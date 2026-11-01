import type { Where } from 'payload'

/** 24 hours — how far ahead a run reminds. */
export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000

/** The interval one run reminds for. */
export interface ReminderWindow {
  /** Exclusive: a session starting exactly now has begun. */
  start: Date
  /** Inclusive: the session exactly 24h out is this run's, not the next one's. */
  end: Date
}

/** The window a run clocked at `now` reminds for. */
export function reminderWindow(now: Date): ReminderWindow {
  return { start: now, end: new Date(now.getTime() + REMINDER_WINDOW_MS) }
}

/** Whether a session start falls in the window. */
export function withinReminderWindow(
  startsAt: Date | number | string,
  { end, start }: ReminderWindow,
): boolean {
  const ms = new Date(startsAt).getTime()
  return ms > start.getTime() && ms <= end.getTime()
}

/**
 * The same bounds as SQL, for a column holding one session's start.
 *
 * One rule, two expressions — kept in one file so they cannot drift, and
 * pinned against each other by `tests/unit/reminder-window.spec.ts`. Make
 * either bound inclusive on its own and the query drops rows the predicate
 * would still remind, with missing reminders as the only symptom. Same shape,
 * and the same reason, as `@/lib/registrations/active`.
 */
export function reminderWindowWhere(field: string, { end, start }: ReminderWindow): Where {
  return {
    and: [
      { [field]: { greater_than: start.toISOString() } },
      { [field]: { less_than_equal: end.toISOString() } },
    ],
  }
}
