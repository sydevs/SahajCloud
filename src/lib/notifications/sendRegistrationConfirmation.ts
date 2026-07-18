/**
 * Send the registrant-facing confirmation for an event registration.
 *
 * Composes the four seams this feature adds — client branding, the localized
 * copy, the shaped event facts, and the ICS attachment — into one send.
 *
 * Deliberately *throws* on failure rather than swallowing: the "a failed send
 * must still return 201" policy belongs at the call site, where the response is
 * decided, not buried here. #589's reminder job will want a different policy
 * (retry) from the same function.
 */

import type { Payload, PayloadRequest } from 'payload'

import { createElement } from 'react'

import {
  RegistrationConfirmationEmail,
  registrationConfirmationText,
} from '@/emails/RegistrationConfirmationEmail'
import { CONTACT_EMAIL } from '@/lib/contact'
import type { LocaleCode } from '@/lib/locales'
import { buildEventCalendar } from '@/lib/schedule/icsBuilder'
import { interpolate, resolveEmailStrings } from '@/lib/translations/emailStrings'
import type { Client, Event } from '@/payload-types'
import { getClientEmailBrand, getEmailBrand, renderEmail } from '@/plugins/email'

import { buildRegistrationEmailDetails } from './registrationDetails'

/** The client fields the email needs; `logo` must be populated (`depth >= 1`). */
export type EmailClient = Pick<
  Client,
  'color1' | 'color2' | 'logo' | 'name' | 'supportEmail' | 'websiteUrl'
>

export async function sendRegistrationConfirmation(args: {
  payload: Payload
  event: Event
  /** Client service the registration came through; `null` uses the Atlas brand. */
  client?: EmailClient | null
  registrantName: string
  registrantEmail: string
  locale?: LocaleCode | null
  /** Stable per-registration id, so a re-send updates the calendar entry. */
  registrationUuid?: string | null
  req?: PayloadRequest
}): Promise<void> {
  const { payload, event, client, registrantName, registrantEmail, locale, registrationUuid, req } =
    args

  const brand = client ? getClientEmailBrand(client) : getEmailBrand('sahaj-atlas')
  const strings = await resolveEmailStrings({ payload, locale, req })
  const details = buildRegistrationEmailDetails(event)

  // The calendar is best-effort: an event whose schedule can't be resolved
  // still gets a confirmation, just without the invite (and without the hint
  // that promises one).
  const calendar = buildEventCalendar({
    title: details.eventTitle,
    schedule: event.schedule ?? {},
    location:
      details.location.type === 'online'
        ? details.location.joinUrl
        : details.location.type === 'offline'
          ? details.location.address
          : null,
    description: details.description,
    uid: registrationUuid ? `registration-${registrationUuid}` : null,
  })

  const templateProps = {
    name: registrantName,
    brand,
    strings,
    details,
    websiteUrl: client?.websiteUrl,
    hasCalendarAttachment: Boolean(calendar),
  }

  await payload.sendEmail({
    to: registrantEmail,
    // `From` stays CONTACT_EMAIL — Resend verifies senders per domain, so we
    // can't send as the client. The client's name carries the branding, and
    // `Reply-To` routes replies to them.
    from: `${brand.productName} <${CONTACT_EMAIL}>`,
    ...(client?.supportEmail && { replyTo: client.supportEmail }),
    subject: interpolate(strings.confirmation_subject, { event: details.eventTitle }),
    html: await renderEmail(createElement(RegistrationConfirmationEmail, templateProps)),
    text: registrationConfirmationText(templateProps),
    ...(calendar && {
      attachments: [
        {
          filename: 'invite.ics',
          content: calendar,
          // METHOD is absent from the calendar, so clients treat this as an
          // importable event rather than a meeting request needing an RSVP.
          contentType: 'text/calendar; charset=utf-8',
        },
      ],
    }),
  })
}
