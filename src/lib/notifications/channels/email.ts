import type { ReminderLevel, ReminderPayload, ResolvedRecipient } from '../types'
import type { Payload } from 'payload'

import { createElement } from 'react'

import { EventVerificationReminderEmail } from '@/emails/EventVerificationReminderEmail'
import { renderEmail } from '@/plugins/email'

const SUBJECTS: Record<ReminderLevel, (title: string) => string> = {
  due: (title) => `Please verify your event: ${title}`,
  escalated: (title) => `Action needed — verify your event: ${title}`,
  expired: (title) => `Your event has been unpublished: ${title}`,
}

/**
 * Email channel — renders the reminder template (branded `sahaj-atlas`, via
 * #483's `renderEmail`) and sends through the configured adapter
 * (Resend in prod, Ethereal in dev).
 */
export async function sendEmailReminder(
  client: Payload,
  recipient: ResolvedRecipient,
  reminder: ReminderPayload,
): Promise<void> {
  const html = await renderEmail(
    createElement(EventVerificationReminderEmail, {
      name: recipient.manager.name || recipient.destination,
      eventTitle: reminder.eventTitle,
      verifyUrl: reminder.verifyUrl,
      level: reminder.level,
    }),
  )

  await client.sendEmail({
    to: recipient.destination,
    subject: SUBJECTS[reminder.level](reminder.eventTitle),
    html,
  })
}
