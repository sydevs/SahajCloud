import type { VerificationStage } from './stages'
import type { JSONSchema4 } from 'json-schema'

import type { ReminderAudience, ReminderLevel } from '@/lib/notifications'

import { VERIFICATION_STAGES } from './stages'

/**
 * The on-document `notificationLog` — the **current verification cycle**.
 *
 * Reset on every verification, where the first entry records the verification
 * itself; each reminder the job sends appends one entry. The log is both the
 * audit trail (who was contacted, how) and the exactly-once delivery marker:
 * the job sends a stage's reminder only to recipients not already logged for
 * that stage this cycle, so a crashed mid-fan-out run resumes without
 * duplicating.
 *
 * Stored as a bare array under a JSON Schema (below), which is what buys the
 * generated `Event['notificationLog']` type *and* write-time validation — a
 * malformed entry throws a `ValidationError` instead of landing in the column
 * for a reader to defend against.
 */

/** How a verification was triggered. */
export const VERIFICATION_METHODS = ['re-save', 'verify-action', 'email-link', 'import'] as const
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number]

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
  /** Internal dedup key — the from-stage. Not shown in the admin table. */
  stage: VerificationStage
  /** Escalation level (the "why"): due / escalated / urgent / expired. */
  level: ReminderLevel
  /** Recipient tier: the event's own manager, or a region manager above it. */
  role: ReminderAudience
  /** The ancestor region that linked a region manager to the event (`role: 'region'`). */
  region?: string
  at: string // ISO 8601
  manager: ActorRef
  /** Delivery method used, e.g. `email` / `whatsapp`. */
  channel: string
  /** Address/handle the reminder went to. */
  destination: string
}

export type NotificationLogEntry = VerificationLogEntry | ReminderLogEntry

/**
 * Restate a union as a runtime array, rejecting an incomplete list.
 *
 * `ReminderLevel` / `ReminderAudience` are declared in an email template, so
 * importing a runtime constant from there would pull React into every module
 * that reads a log. Listing the members here instead is safe only if the
 * compiler checks the list is *exhaustive* — `satisfies` alone would happily
 * accept a list missing a member, and the schema would then reject a level the
 * job legitimately sends.
 */
function completeList<Union extends string>() {
  return <const List extends readonly Union[]>(
    list: [Union] extends [List[number]] ? List : never,
  ): List => list
}

const REMINDER_LEVELS = completeList<ReminderLevel>()(['due', 'escalated', 'urgent', 'expired'])
const REMINDER_AUDIENCES = completeList<ReminderAudience>()(['manager', 'region'])

const actorRefProperties: JSONSchema4 = {
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: { type: 'number' }, name: { type: 'string' } },
}

const actorRefSchema: JSONSchema4 = { type: 'object', ...actorRefProperties }

/**
 * `by` is null for a system-triggered verification (the importer, the job).
 * Expressed as a `type` union rather than `oneOf: [actorRef, null]` — the two
 * are equivalent here (`required`/`properties` only constrain the object
 * branch), and the flatter form is what the type generator renders as
 * `{ id, name } | null`.
 */
const nullableActorRefSchema: JSONSchema4 = { type: ['object', 'null'], ...actorRefProperties }

/**
 * JSON Schema for the stored `notificationLog`, wired onto the Events field's
 * `jsonSchema`. The entry variants mirror the two interfaces above, keyed on
 * `kind`; the stage/level/audience enums are derived from their own constants
 * so they can't drift from the lifecycle config.
 *
 * `additionalProperties: false` on each variant is the point — a writer that
 * invents a key gets a `ValidationError` rather than a column nobody notices
 * is wrong.
 */
/** `$id` / `fileMatch` key Payload names the generated type from. */
export const NOTIFICATION_LOG_SCHEMA_URI =
  'https://sahajcloud.dev/schemas/event-notification-log.json'

export const notificationLogJsonSchema: JSONSchema4 = {
  $id: NOTIFICATION_LOG_SCHEMA_URI,
  type: 'array',
  items: {
    anyOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'at', 'by', 'method'],
        properties: {
          kind: { enum: ['verification'] },
          at: { type: 'string' },
          by: nullableActorRefSchema,
          method: { enum: [...VERIFICATION_METHODS] },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'stage', 'level', 'role', 'at', 'manager', 'channel', 'destination'],
        properties: {
          kind: { enum: ['reminder'] },
          stage: { enum: [...VERIFICATION_STAGES] },
          level: { enum: [...REMINDER_LEVELS] },
          role: { enum: [...REMINDER_AUDIENCES] },
          region: { type: 'string' },
          at: { type: 'string' },
          manager: actorRefSchema,
          channel: { type: 'string' },
          destination: { type: 'string' },
        },
      },
    ],
  },
}

/** Build the cycle-opening verification entry. */
export function buildVerificationEntry(
  method: VerificationMethod,
  by: ActorRef | null,
  at: string,
): VerificationLogEntry {
  return { kind: 'verification', at, by, method }
}

/** Build a reminder entry for one successful send. */
export function buildReminderEntry(args: {
  stage: VerificationStage
  level: ReminderLevel
  role: ReminderAudience
  /** Linking region — included only for region-manager recipients. */
  region?: string
  manager: ActorRef
  channel: string
  destination: string
  at: string
}): ReminderLogEntry {
  const { stage, level, role, region, manager, channel, destination, at } = args
  return {
    kind: 'reminder',
    stage,
    level,
    role,
    ...(region ? { region } : {}),
    at,
    manager,
    channel,
    destination,
  }
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

/**
 * Read the stored field as a log-entry array.
 *
 * The schema guarantees the shape of anything written *through Payload*, so
 * this only has to cope with the field being absent — a document that has
 * never been verified.
 */
export function asNotificationLog(value: unknown): NotificationLogEntry[] {
  return Array.isArray(value) ? (value as NotificationLogEntry[]) : []
}
