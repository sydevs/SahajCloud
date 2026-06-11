import type { ReminderLevel } from '@/emails/EventVerificationReminderEmail'
import type { Manager } from '@/payload-types'

export type { ReminderLevel }

/** Delivery channels. Only `email` is wired in v1; the rest are stubbed. */
export type NotificationChannel = 'email' | 'whatsapp' | 'telegram' | 'wechat'

/** The structured reminder content each channel formats. */
export interface ReminderPayload {
  eventTitle: string
  /** Escalation level — selects email copy. */
  level: ReminderLevel
  /** Per-recipient tokenized verify link. */
  verifyUrl: string
}

/** A recipient resolved to a concrete channel + destination. */
export interface ResolvedRecipient {
  manager: Manager
  channel: NotificationChannel
  /** Email address or platform handle the reminder goes to. */
  destination: string
}
