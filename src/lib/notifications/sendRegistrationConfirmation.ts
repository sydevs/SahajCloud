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

import { RegistrationConfirmationEmail } from '@/emails/RegistrationConfirmationEmail'
import type { OwnershipFields } from '@/lib/clients/site'
import { ownedHost } from '@/lib/clients/site'
import type { LocaleCode } from '@/lib/locales'
import { buildEventCalendar } from '@/lib/schedule/icsBuilder'
import { interpolate, resolveEmailStrings } from '@/lib/translations/emailStrings'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import type { Client, Event } from '@/payload-types'
import { getClientEmailBrand, getEmailBrand, renderEmail, USER_EMAIL_FROM } from '@/plugins/email'

import { buildRegistrationEmailDetails } from './registrationDetails'

/**
 * The client fields the email needs; `logo` must be populated (`depth >= 1`).
 * `enabled`, `site` and `canonical` decide the site link: the email links to a
 * service's site only while it owns its region (`ownedHost`).
 */
/** What a registrant email reads off the client: its brand, and its site link's ownership. */
export const EMAIL_CLIENT_SELECT = {
  color1: true,
  color2: true,
  logo: true,
  title: true,
  supportEmail: true,
  enabled: true,
  site: true,
  canonical: { owned: true, verification: true },
} as const

export type EmailClient = Pick<Client, 'color1' | 'color2' | 'logo' | 'title' | 'supportEmail'> &
  OwnershipFields

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
  const details = buildRegistrationEmailDetails(event, { locale, strings })

  // The calendar is best-effort: an event whose schedule can't be resolved
  // still gets a confirmation, just without the invite attached.
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

  const siteHost = client ? ownedHost(client) : null

  await payload.sendEmail({
    to: registrantEmail,
    // Resend verifies senders per domain, so we can't send as the client. The
    // client's name carries the branding, and `Reply-To` routes replies to them.
    from: `${headerDisplayName(brand.productName)} <${USER_EMAIL_FROM}>`,
    ...(client?.supportEmail && { replyTo: client.supportEmail }),
    // The event title is manager-authored free text; strip line breaks so it
    // can't inject a second header off the Subject line.
    subject: stripNewlines(
      interpolate(strings.confirmation_subject, { event: details.eventTitle }),
    ),
    ...(await renderEmail(
      createElement(RegistrationConfirmationEmail, {
        name: registrantName,
        brand,
        strings,
        details,
        locale,
        websiteUrl: siteHost ? `https://${siteHost}` : null,
      }),
    )),
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
