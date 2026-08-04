import type { VerificationStage } from './stages'
import type { JSONSchema4 } from 'json-schema'
import type { JSONField } from 'payload'


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

/** Narrow an unknown json value (the stored field) to a log-entry array. */
export function asNotificationLog(value: unknown): NotificationLogEntry[] {
  return Array.isArray(value) ? (value as NotificationLogEntry[]) : []
}

const NOTIFICATION_LOG_SCHEMA_URI = 'https://sahajcloud.dev/schemas/event-notification-log.json'

/** `ActorRef` as JSON Schema. */
const actorRefSchema: JSONSchema4 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: {
    id: { type: 'number' },
    name: { type: 'string' },
  },
}

/**
 * `jsonSchema` for `Events.notificationLog` — the two entry shapes above as a
 * discriminated union on `kind`. Nothing but the builders in this file writes
 * the field, so this is primarily about the generated TypeScript type: without
 * it the whole log reads back as `unknown`. Validation is the free bonus, and
 * it holds a hand-written fixture to the same shape the builders produce.
 *
 * `level` and `role` stay plain strings: their vocabulary is declared by
 * `EventVerificationEmail`, and this module is value-imported by admin client
 * components — enumerating them here would pull react-email into that bundle.
 */
export const notificationLogJsonSchema: NonNullable<JSONField['jsonSchema']> = {
  uri: NOTIFICATION_LOG_SCHEMA_URI,
  fileMatch: [NOTIFICATION_LOG_SCHEMA_URI],
  schema: {
    type: 'array',
    items: {
      anyOf: [
        {
          type: 'object',
          description: 'The verification that opened the current cycle.',
          additionalProperties: false,
          required: ['kind', 'at', 'by', 'method'],
          properties: {
            kind: { enum: ['verification'] },
            at: { type: 'string', description: 'ISO 8601 timestamp.' },
            by: {
              anyOf: [actorRefSchema, { type: 'null' }],
              description: 'The manager who verified, or null for an automated verification.',
            },
            method: { type: 'string', enum: [...VERIFICATION_METHODS] },
          },
        },
        {
          type: 'object',
          description: 'One reminder delivery, appended per recipient per stage.',
          additionalProperties: false,
          required: ['kind', 'stage', 'level', 'role', 'at', 'manager', 'channel', 'destination'],
          properties: {
            kind: { enum: ['reminder'] },
            stage: {
              type: 'string',
              enum: [...VERIFICATION_STAGES],
              description: 'The from-stage — the per-recipient dedup key.',
            },
            level: { type: 'string', description: 'due / escalated / urgent / expired.' },
            role: { type: 'string', description: "manager (the event's own) or region." },
            region: {
              type: 'string',
              description: 'The ancestor region that linked a region manager to the event.',
            },
            at: { type: 'string', description: 'ISO 8601 timestamp.' },
            manager: actorRefSchema,
            channel: { type: 'string', description: 'Delivery method used, e.g. email.' },
            destination: { type: 'string', description: 'Address/handle the reminder went to.' },
          },
        },
      ],
    },
  },
}
