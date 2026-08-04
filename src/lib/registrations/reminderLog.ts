/**
 * Exactly-once ledger for session reminders, stored on `Registrations.reminderLog`.
 *
 * One entry per occurrence a registration has been reminded for. The reminder
 * job checks membership before sending and appends immediately after, so a task
 * retry or an overlapping run never double-sends. Mirrors the Events
 * `notificationLog` shape and helpers (`asNotificationLog` / `hasReminderForStage`).
 *
 * Lives in `src/lib/` because two owners share it: the SendSessionReminders job
 * reads and appends, and the Registrations collection types the column from the
 * schema below.
 */

import type { JSONField } from 'payload'

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

const REMINDER_LOG_SCHEMA_URI = 'https://sahajcloud.dev/schemas/registration-reminder-log.json'

/**
 * `jsonSchema` for `Registrations.reminderLog`. Only the reminder job writes the
 * field, so the point is the generated TypeScript type — the ledger reads back
 * as the entry shape above instead of `unknown`.
 */
export const reminderLogJsonSchema: NonNullable<JSONField['jsonSchema']> = {
  uri: REMINDER_LOG_SCHEMA_URI,
  fileMatch: [REMINDER_LOG_SCHEMA_URI],
  schema: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['occurrence', 'sentAt'],
      properties: {
        occurrence: {
          type: 'string',
          description: 'ISO start of the reminded occurrence — the exactly-once dedup key.',
        },
        sentAt: { type: 'string', description: 'When the reminder was sent (ISO).' },
      },
    },
  },
}
