/**
 * Send a manager-facing registration digest: one email per recipient per period,
 * listing the new registrations grouped by event.
 *
 * Only the email channel is wired; a messaging channel is stub-logged exactly as
 * the immediate notification's stub does. Deliberately *throws* on a real send
 * failure so the digest job can leave the manager's watermark untouched and
 * retry the whole period next run — the exactly-once guarantee lives in that
 * watermark, not here.
 */

import type { Payload } from 'payload'

import { createElement } from 'react'

import type { DigestEventGroup, DigestPeriod } from '@/emails/RegistrationDigestEmail'
import { RegistrationDigestEmail, registrationDigestText } from '@/emails/RegistrationDigestEmail'
import { CONTACT_EMAIL } from '@/lib/contact'
import type { RegistrationRecipient } from '@/lib/notifications/registrationRecipient'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import { getEmailBrand, renderEmail } from '@/plugins/email'

export async function sendRegistrationDigest(args: {
  payload: Payload
  recipient: RegistrationRecipient
  period: DigestPeriod
  groups: DigestEventGroup[]
}): Promise<void> {
  const { payload, recipient, period, groups } = args

  if (recipient.channel !== 'email') {
    // Parity with the immediate notification's stub: no messaging transport is
    // wired yet, so log and move on rather than dropping the digest silently.
    payload.logger.warn({
      msg: `notifications: ${recipient.channel} channel not yet implemented — registration digest logged, not delivered`,
      channel: recipient.channel,
      destination: recipient.destination,
    })
    return
  }

  const brand = getEmailBrand('sahaj-atlas')
  const total = groups.reduce((sum, group) => sum + group.registrations.length, 0)
  const templateProps = { recipientName: recipient.name, period, groups }

  await payload.sendEmail({
    to: recipient.destination,
    // `From` stays CONTACT_EMAIL (Resend verifies senders per domain); the brand
    // name carries the identity.
    from: `${headerDisplayName(brand.productName)} <${CONTACT_EMAIL}>`,
    subject: stripNewlines(`Registration summary: ${total} new`),
    html: await renderEmail(createElement(RegistrationDigestEmail, templateProps)),
    text: registrationDigestText(templateProps),
  })
}
