import type { VerificationStage } from './stages'

/**
 * The on-document `notificationLog` — the **current verification cycle**.
 *
 * Reset on every verification, where the first entry records the verification
 * itself; each reminder the job sends appends one entry. The log is both the
 * audit trail (who was contacted, how) and the exactly-once delivery marker:
 * the job sends a stage's reminder only to recipients not already logged for
 * that stage this cycle, so a crashed mid-fan-out run resumes without
 * duplicating.
 */

/** How a verification was triggered. */
export type VerificationMethod = 're-save' | 'verify-action' | 'email-link' | 'import'

/** A manager reference captured in the log (id + display name). */
export interface ActorRef {
  id: number
  name: string
}

/** First entry of every cycle — records the verification that opened it. */
export interface VerificationLogEntry {
  kind: 'verification'
  at: string // ISO 8601
  by: ActorRef | null
  method: VerificationMethod
}

/** One reminder delivery (appended per recipient, per stage). */
export interface ReminderLogEntry {
  kind: 'reminder'
  stage: VerificationStage
  at: string // ISO 8601
  manager: ActorRef
  /** Delivery method used, e.g. `email` / `whatsapp`. */
  channel: string
  /** Address/handle the reminder went to. */
  destination: string
}

export type NotificationLogEntry = VerificationLogEntry | ReminderLogEntry

/** Build the cycle-opening verification entry. */
export function buildVerificationEntry(
  method: VerificationMethod,
  by: ActorRef | null,
  at: string,
): VerificationLogEntry {
  return { kind: 'verification', at, by, method }
}

/** Build a reminder entry for one successful send. */
export function buildReminderEntry(
  stage: VerificationStage,
  manager: ActorRef,
  channel: string,
  destination: string,
  at: string,
): ReminderLogEntry {
  return { kind: 'reminder', stage, at, manager, channel, destination }
}

/**
 * Whether `managerId` has already been sent a reminder for `stage` in this
 * cycle. The job's per-recipient dedup / crash-resume marker.
 */
export function hasReminderForStage(
  log: NotificationLogEntry[] | null | undefined,
  stage: VerificationStage,
  managerId: number,
): boolean {
  if (!Array.isArray(log)) return false
  return log.some(
    (entry) =>
      entry.kind === 'reminder' && entry.stage === stage && entry.manager?.id === managerId,
  )
}

/** Narrow an unknown json value (the stored field) to a log-entry array. */
export function asNotificationLog(value: unknown): NotificationLogEntry[] {
  return Array.isArray(value) ? (value as NotificationLogEntry[]) : []
}
