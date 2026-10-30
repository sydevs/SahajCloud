/**
 * Send an admin's refused sign-ups digest. Throws on a real send failure, so
 * the job leaves the admin's watermark and retries the period next run — the
 * same contract as `sendRegistrationDigest`.
 */

import type { Payload } from 'payload'

import { createElement } from 'react'

import type { RefusedRegistrationDigestEmailProps } from '@/emails/RefusedRegistrationDigestEmail'
import {
  RefusedRegistrationDigestEmail,
  refusedRegistrationDigestText,
} from '@/emails/RefusedRegistrationDigestEmail'
import type { NotificationChannel } from '@/lib/notifications'
import { headerDisplayName } from '@/lib/utilities/emailSafeText'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'

export async function sendRefusedRegistrationDigest(args: {
  payload: Payload
  channel: NotificationChannel
  destination: string
  props: RefusedRegistrationDigestEmailProps
}): Promise<void> {
  const { payload, channel, destination, props } = args

  if (channel !== 'email') {
    // Parity with the other digests: no messaging transport is wired yet.
    payload.logger.warn({
      msg: `notifications: ${channel} channel not yet implemented — refused sign-ups digest logged, not delivered`,
      channel,
      destination,
    })
    return
  }

  const brand = getEmailBrand('sahaj-atlas')

  await payload.sendEmail({
    to: destination,
    from: `${headerDisplayName(brand.productName)} <${MANAGER_EMAIL_FROM}>`,
    subject: `Refused sign-ups: ${props.total}`,
    html: await renderEmail(createElement(RefusedRegistrationDigestEmail, props)),
    text: refusedRegistrationDigestText(props),
  })
}
