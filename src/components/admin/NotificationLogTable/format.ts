import { toWords } from 'payload/shared'

import type {
  ActorRef,
  NotificationLogEntry,
  VerificationMethod,
} from '@/lib/eventVerification/log'
import type { ReminderAudience, ReminderLevel } from '@/lib/notifications'

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

/** ISO timestamp → words, e.g. `13 June 2026, 14:30`. */
export function formatLogDate(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return at
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** An actor reference → display name, falling back to `#id`. */
function actorName(actor: ActorRef | null | undefined): string {
  if (!actor) return 'Unknown'
  if (actor.name) return actor.name
  return actor.id != null ? `#${actor.id}` : 'Unknown'
}

/** The "Event" column — what happened: `Verified`, or the reminder's level. */
export function eventLabel(entry: NotificationLogEntry): string {
  return entry.kind === 'verification' ? 'Verified' : LEVEL_LABELS[entry.level]
}

/** A "Who" cell: primary name + an optional muted sub-line (role · region). */
export interface WhoCell {
  name: string
  sub?: string
}

/**
 * The "Who" column. Verification → who verified it. Reminder → the recipient
 * plus their tier (and the linking region for region managers), so it's clear
 * who was notified and why they were in scope.
 */
export function whoCell(entry: NotificationLogEntry): WhoCell {
  if (entry.kind === 'verification') {
    return { name: actorName(entry.by) }
  }
  const role = ROLE_LABELS[entry.role]
  return {
    name: actorName(entry.manager),
    sub: entry.region ? `${role} · ${entry.region}` : role,
  }
}

/** A "Delivery" cell: a verification method, or a reminder's channel + destination. */
export type DeliveryCell = { method: string } | { channel: string; destination: string }

/**
 * The "Delivery" column. Verification → how it was verified (method). Reminder →
 * the channel and where it was sent (the channel is rendered as a muted label).
 */
export function deliveryCell(entry: NotificationLogEntry): DeliveryCell {
  if (entry.kind === 'verification') {
    return { method: METHOD_LABELS[entry.method] ?? toWords(entry.method) }
  }
  return { channel: entry.channel, destination: entry.destination }
}
