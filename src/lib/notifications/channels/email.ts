import type { ReminderAudience, ReminderLevel, ReminderPayload, ResolvedRecipient } from '../types'
import type { Payload } from 'payload'

import { createElement } from 'react'

import { EventVerificationEmail } from '@/emails/EventVerificationEmail'
import { renderEmail } from '@/plugins/email'

function subjectFor(level: ReminderLevel, audience: ReminderAudience, title: string): string {
  if (audience === 'region') {
    switch (level) {
      case 'expired':
        return `Unpublished — an event in your region: ${title}`
      case 'urgent':
        return `Final notice — an event in your region: ${title}`
      default:
        return `Needs verification — an event in your region: ${title}`
    }
  }
  switch (level) {
    case 'due':
      return `Please verify your event: ${title}`
    case 'escalated':
      return `Action needed — verify your event: ${title}`
    case 'urgent':
      return `Final reminder — verify your event: ${title}`
    case 'expired':
      return `Your event has been unpublished: ${title}`
  }
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
    createElement(EventVerificationEmail, {
      name: recipient.manager.name || recipient.destination,
      eventTitle: reminder.eventTitle,
      verifyUrl: reminder.verifyUrl,
      level: reminder.level,
      audience: reminder.audience,
      details: reminder.details,
      deadline: reminder.deadline,
      sinceLastVerified: reminder.sinceLastVerified,
      regionName: reminder.regionName,
      eventManager: reminder.eventManager,
    }),
  )

  await client.sendEmail({
    to: recipient.destination,
    subject: subjectFor(reminder.level, reminder.audience, reminder.eventTitle),
    html,
  })
}
