import type { Payload } from 'payload'

import { createElement } from 'react'

import type { DigestEmailProps } from '@/emails/DigestEmail'
import { DigestEmail, digestEmailText } from '@/emails/DigestEmail'
import { pickChannel } from '@/lib/notifications'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import type { Manager } from '@/payload-types'
import { getEmailBrand, MANAGER_EMAIL_FROM, renderEmail } from '@/plugins/email'

/**
 * Send one role's digest.
 *
 * ⚠ **A failed send throws** (`docs/rules/email.md`), which is what lets the
 * caller leave that role's watermarks untouched and cover the same window
 * again next run.
 *
 * The channel comes from the manager's own `open_items` method, so a manager
 * who picked a messaging handle is not silently mailed instead — though no
 * messaging transport is wired yet, so that case logs and moves on, as every
 * other notification's stub does.
 */
export async function sendDigest(args: {
  manager: Manager
  payload: Payload
  props: DigestEmailProps
  subject: string
}): Promise<void> {
  const { manager, payload, props, subject } = args
  const { channel, destination } = pickChannel(manager, 'open_items')

  if (channel !== 'email' || !destination) {
    payload.logger.warn({
      channel,
      msg: `notifications: ${channel} channel not yet implemented — digest logged, not delivered`,
      managerId: manager.id,
    })
    return
  }

  const brand = getEmailBrand('sahaj-atlas')
  await payload.sendEmail({
    from: `${headerDisplayName(brand.productName)} <${MANAGER_EMAIL_FROM}>`,
    html: await renderEmail(createElement(DigestEmail, props)),
    subject: stripNewlines(subject),
    text: digestEmailText(props),
    to: destination,
  })
}
