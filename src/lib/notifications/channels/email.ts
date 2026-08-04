import type { ReminderPayload, ResolvedRecipient } from '../types'
import type { Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import { EventVerificationEmail, verificationSubject } from '@/emails/EventVerificationEmail'
import { languageToLocale } from '@/lib/locales'
import { resolveEmailStrings } from '@/lib/translations/emailStrings'
import { stripNewlines } from '@/lib/utilities/emailSafeText'
import { renderEmail } from '@/plugins/email'

/**
 * Email channel — renders the reminder template (branded `sahaj-atlas`, via
 * #483's `renderEmail`) and sends through the configured adapter
 * (Resend in prod, Ethereal in dev).
 *
 * Subject and body resolve in the recipient's own language off
 * `Managers.language`. That field offers every ISO 639-1 language, so it maps
 * through `languageToLocale` onto a CMS locale; unset — or set to a language the
 * CMS isn't translated into — resolves the default locale, and an individually
 * untranslated key falls back to its English default.
 */
export async function sendEmailReminder(
  client: Payload,
  recipient: ResolvedRecipient,
  reminder: ReminderPayload,
  req?: PayloadRequest,
): Promise<void> {
  const locale = languageToLocale(recipient.manager.language)
  const strings = await resolveEmailStrings({ payload: client, locale, req })

  const html = await renderEmail(
    createElement(EventVerificationEmail, {
      name: recipient.manager.name || recipient.destination,
      eventTitle: reminder.eventTitle,
      verifyUrl: reminder.verifyUrl,
      eventUrl: reminder.eventUrl,
      level: reminder.level,
      audience: reminder.audience,
      strings,
      locale,
      details: reminder.details,
      deadline: reminder.deadline,
      sinceLastVerified: reminder.sinceLastVerified,
      regionName: reminder.regionName,
      eventManager: reminder.eventManager,
    }),
  )

  await client.sendEmail({
    to: recipient.destination,
    // The event title is manager-authored free text; strip line breaks so it
    // can't inject a second header off the Subject line.
    subject: stripNewlines(
      verificationSubject({
        strings,
        audience: reminder.audience,
        level: reminder.level,
        eventTitle: reminder.eventTitle,
      }),
    ),
    html,
  })
}
