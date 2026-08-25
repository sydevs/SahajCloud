import type { VerificationStage } from './stages'

import { toWords } from 'payload/shared'

import type { LogCell } from '@/fields'
import type { ReminderAudience, ReminderLevel } from '@/lib/notifications'


/**
 * The on-document `activityLog` — the **current verification cycle**.
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
/**
 * Display cells every entry carries alongside its machine fields, so the shared
 * `LogTable` can render this log without knowing anything about verification.
 * Additive by construction — see `logField`.
 */
interface LogDisplayCells {
  /** Shared discriminator the log helpers match on. */
  type: string
  /** Rendered columns. Everything else on the entry is data, not display. */
  cells: { activity: string; who: LogCell; delivery: LogCell }
}

export interface VerificationLogEntry extends LogDisplayCells {
  kind: 'verification'
  at: string // ISO 8601
  by: ActorRef | null
  method: VerificationMethod
}

/** One reminder delivery (appended per recipient, per stage). */
export interface ReminderLogEntry extends LogDisplayCells {
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
/** Friendly labels for how a verification was triggered. */
const METHOD_LABELS: Record<VerificationMethod, string> = {
  're-save': 'Saved',
  'verify-action': 'Verify button',
  'email-link': 'Email link',
  import: 'Import',
}

/** Escalation level → plain-English "what happened / why". */
const LEVEL_LABELS: Record<ReminderLevel, string> = {
  due: 'Reminder',
  escalated: 'Escalation',
  urgent: 'Final reminder',
  expired: 'Unpublished notice',
}

/** Recipient tier → label. */
const ROLE_LABELS: Record<ReminderAudience, string> = {
  manager: 'Event manager',
  region: 'Region manager',
}

/** An actor reference → display name, falling back to `#id`. */
function actorName(actor: ActorRef | null | undefined): string {
  if (!actor) return 'Unknown'
  if (actor.name) return actor.name
  return actor.id != null ? `#${actor.id}` : 'Unknown'
}

export function buildVerificationEntry(
  method: VerificationMethod,
  by: ActorRef | null,
  at: string,
): VerificationLogEntry {
  return {
    kind: 'verification',
    type: 'verification',
    at,
    by,
    method,
    // Display alongside the machine fields, never instead of them —
    // `hasReminderForStage` reads `kind`/`stage`/`manager.id` back as data.
    cells: {
      activity: 'Verified',
      // The Atlas seed importer verifies with no acting manager.
      who: method === 'import' ? 'Sahaj Atlas Import' : actorName(by),
      delivery: METHOD_LABELS[method] ?? toWords(method),
    },
  }
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
  const roleLabel = ROLE_LABELS[role]
  return {
    kind: 'reminder',
    type: 'reminder',
    stage,
    level,
    role,
    ...(region ? { region } : {}),
    at,
    manager,
    channel,
    destination,
    // Display alongside the machine fields, never instead of them.
    cells: {
      activity: LEVEL_LABELS[level],
      who: { text: actorName(manager), sub: region ? `${roleLabel} · ${region}` : roleLabel },
      delivery: { label: channel, text: destination },
    },
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
