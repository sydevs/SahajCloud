/**
 * Exactly-once ledger for session reminders, stored on `Registrations.reminderLog`.
 *
 * One entry per occurrence a registration has been reminded for. The reminder
 * job checks membership before sending and appends immediately after, so a task
 * retry or an overlapping run never double-sends. Mirrors the Events
 * `notificationLog` shape and helpers (`asNotificationLog` / `hasReminderForStage`).
 */

/** One reminded occurrence. */
export interface ReminderLogEntry {
  /** ISO start of the reminded occurrence — the exactly-once dedup key. */
  occurrence: string
  /** When the reminder was sent (ISO). */
  sentAt: string
}

/** Coerce the loosely-typed `reminderLog` JSON column into a clean entry list. */
export function asReminderLog(value: unknown): ReminderLogEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is ReminderLogEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { occurrence?: unknown }).occurrence === 'string',
  )
}

/** Has this registration already been reminded for `occurrenceIso`? */
export function hasReminderFor(log: ReminderLogEntry[], occurrenceIso: string): boolean {
  return log.some((entry) => entry.occurrence === occurrenceIso)
}
