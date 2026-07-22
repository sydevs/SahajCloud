/**
 * Send a registrant-facing session reminder for one upcoming occurrence.
 *
 * Reuses the confirmation's four seams — client branding, localized copy, the
 * shaped event facts, the send path — but states the single next occurrence,
 * attaches no ICS (the confirmation already delivered the calendar), and carries
 * an unsubscribe link. Deliberately *throws* on failure so the reminder job can
 * choose its own policy (skip this registration, retry next run) at the call
 * site, matching `sendRegistrationConfirmation`.
 */

import type { EmailClient } from './sendRegistrationConfirmation'
import type { Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import { SessionReminderEmail, sessionReminderText } from '@/emails/SessionReminderEmail'
import { CONTACT_EMAIL } from '@/lib/contact'
import type { LocaleCode } from '@/lib/locales'
import { signUnsubscribeToken } from '@/lib/registrations/unsubscribeToken'
import { buildUnsubscribeEmailLink } from '@/lib/registrations/unsubscribeUrl'
import { interpolate, resolveEmailStrings } from '@/lib/translations/emailStrings'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import type { Event } from '@/payload-types'
import { getClientEmailBrand, getEmailBrand, renderEmail } from '@/plugins/email'

import { buildReminderEmailDetails } from './registrationDetails'

export async function sendSessionReminder(args: {
  payload: Payload
  event: Event
  /** Client service the registration came through; `null` uses the Atlas brand. */
  client?: EmailClient | null
  registrantName: string
  registrantEmail: string
  locale?: LocaleCode | null
  /** Registration id — signed into the unsubscribe link. */
  registrationId: number
  /** ISO start of the occurrence being reminded about. */
  occurrenceIso: string
  req?: PayloadRequest
}): Promise<void> {
  const {
    payload,
    event,
    client,
    registrantName,
    registrantEmail,
    locale,
    registrationId,
    occurrenceIso,
    req,
  } = args

  const brand = client ? getClientEmailBrand(client) : getEmailBrand('sahaj-atlas')
  const strings = await resolveEmailStrings({ payload, locale, req })
  const details = buildReminderEmailDetails(event, occurrenceIso)
  const unsubscribeUrl = buildUnsubscribeEmailLink(
    signUnsubscribeToken({ registrationId }, payload.secret),
  )

  const templateProps = { name: registrantName, brand, strings, details, unsubscribeUrl }

  await payload.sendEmail({
    to: registrantEmail,
    // `From` stays CONTACT_EMAIL — Resend verifies senders per domain, so we
    // can't send as the client. The client's name carries the branding, and
    // `Reply-To` routes replies to them.
    from: `${headerDisplayName(brand.productName)} <${CONTACT_EMAIL}>`,
    ...(client?.supportEmail && { replyTo: client.supportEmail }),
    // The event title is manager-authored free text; strip line breaks so it
    // can't inject a second header off the Subject line.
    subject: stripNewlines(interpolate(strings.reminder_subject, { event: details.eventTitle })),
    html: await renderEmail(createElement(SessionReminderEmail, templateProps)),
    text: sessionReminderText(templateProps),
  })
}
