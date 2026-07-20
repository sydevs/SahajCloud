/**
 * Send the manager-facing notification that a seeker registered for an event.
 *
 * Only the email channel is wired; a messaging channel (whatsapp/telegram/wechat)
 * is stub-logged exactly as the verification reminders' stub does — no new
 * channel work (#588). Deliberately *throws* on a real send failure so the
 * "a failed send must still return 201" policy stays at the call site, matching
 * `sendRegistrationConfirmation`. The future digest run can choose a different
 * policy (retry) from the same recipient seam.
 */

import type { RegistrationRecipient } from './registrationRecipient'
import type { Payload } from 'payload'

import { createElement } from 'react'

import { EventRegistrationEmail } from '@/emails/EventRegistrationEmail'
import { CONTACT_EMAIL } from '@/lib/contact'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { Event } from '@/payload-types'
import { getEmailBrand, renderEmail } from '@/plugins/email'

import { formatLongDate } from './eventDetails'

export async function sendRegistrationNotification(args: {
  payload: Payload
  recipient: RegistrationRecipient
  event: Pick<Event, 'id' | 'title'>
  registrantName: string
  registrantEmail: string
  /** Session the registrant chose (ISO), when supplied. */
  startingAt?: string | null
}): Promise<void> {
  const { payload, recipient, event, registrantName, registrantEmail, startingAt } = args

  if (recipient.channel !== 'email') {
    // Parity with the verification stub: no messaging transport is wired yet, so
    // log and move on rather than dropping the notification silently.
    payload.logger.warn({
      msg: `notifications: ${recipient.channel} channel not yet implemented — registration notification logged, not delivered`,
      channel: recipient.channel,
      destination: recipient.destination,
      eventId: event.id,
    })
    return
  }

  const brand = getEmailBrand('sahaj-atlas')
  const eventTitle = typeof event.title === 'string' ? event.title : `Event #${event.id}`
  const sessionDate = startingAt ? formatLongDate(startingAt) || null : null

  await payload.sendEmail({
    to: recipient.destination,
    // `From` stays CONTACT_EMAIL (Resend verifies senders per domain); the brand
    // name carries the identity.
    from: `${headerDisplayName(brand.productName)} <${CONTACT_EMAIL}>`,
    // The event title is manager-authored free text; strip line breaks so it
    // can't inject a second header off the Subject line.
    subject: stripNewlines(`New registration: ${eventTitle}`),
    html: await renderEmail(
      createElement(EventRegistrationEmail, {
        recipientName: recipient.name,
        eventTitle,
        registrantName,
        registrantEmail,
        sessionDate,
        eventAdminUrl: `${getServerUrl()}/admin/collections/events/${event.id}`,
      }),
    ),
  })
}
