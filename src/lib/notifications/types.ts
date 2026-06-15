import type {
  EventDetails,
  EventManagerContact,
  ReminderAudience,
  ReminderLevel,
} from '@/emails/EventVerificationEmail'
import type { Manager } from '@/payload-types'

export type { EventDetails, EventManagerContact, ReminderAudience, ReminderLevel }

/** Delivery channels. Only `email` is wired in v1; the rest are stubbed. */
export type NotificationChannel = 'email' | 'whatsapp' | 'telegram' | 'wechat'

/** The structured reminder content each channel formats. */
export interface ReminderPayload {
  eventTitle: string
  /** Escalation level — selects email copy. */
  level: ReminderLevel
  /** Whether this recipient is the event manager or a region manager. */
  audience: ReminderAudience
  /** Per-recipient tokenized verify link. */
  verifyUrl: string
  /** Public link to the event on the map — null when the event is unpublished. */
  eventUrl?: string | null
  /** Key event facts for the summary table (same for every recipient). */
  details?: EventDetails
  /** Formatted date the event is / was unpublished (all levels). */
  deadline?: string
  /** Human duration the event has gone unverified. */
  sinceLastVerified: string
  /** The ancestor region linking a region manager to the event. */
  regionName?: string
  /** Event manager's contacts — included for region-manager recipients. */
  eventManager?: EventManagerContact
}

/** A recipient resolved to a concrete channel + destination. */
export interface ResolvedRecipient {
  manager: Manager
  /** The event's own manager, or a region manager above it. */
  role: ReminderAudience
  channel: NotificationChannel
  /** Email address or platform handle the reminder goes to. */
  destination: string
  /** The region linking a region manager to the event (role `region`). */
  regionName?: string
}
