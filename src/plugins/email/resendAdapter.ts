import type { Attachment as NodemailerAttachment } from 'nodemailer/lib/mailer'
import type { EmailAdapter, SendEmailOptions } from 'payload'
import type { CreateEmailOptions } from 'resend'

import * as Sentry from '@sentry/nextjs'
import { Resend } from 'resend'

import { serverEnv } from '@/lib/env'
import { headerDisplayName } from '@/lib/utilities/emailSafeText'

import { getEmailBrand } from './brand'
import { MANAGER_EMAIL_FROM } from './senders'

/**
 * Map Payload's (nodemailer-shaped) attachments onto Resend's.
 *
 * The two overlap on `filename` / `content` / `contentType`, but nodemailer
 * additionally allows a `Readable` stream, which the Resend REST API cannot
 * accept. Streams are dropped rather than passed through as a bad payload —
 * a missing attachment with a log line beats an opaque Resend 422.
 */
function toResendAttachments(
  attachments: SendEmailOptions['attachments'],
  onUnsupported: (filename: string) => void,
): CreateEmailOptions['attachments'] {
  if (!Array.isArray(attachments)) return undefined

  const mapped: NonNullable<CreateEmailOptions['attachments']> = []

  for (const attachment of attachments as NodemailerAttachment[]) {
    const { cid, content, contentType, filename, path } = attachment
    const isSendable = typeof content === 'string' || Buffer.isBuffer(content)

    // `path` is a hosted URL Resend fetches itself, so it needs no content.
    if (!isSendable && !path) {
      onUnsupported(typeof filename === 'string' ? filename : 'unnamed')
      continue
    }

    mapped.push({
      ...(isSendable && { content: content as Buffer | string }),
      ...(typeof filename === 'string' && { filename }),
      ...(contentType && { contentType }),
      ...(typeof path === 'string' && { path }),
      ...(cid && { contentId: cid }),
    })
  }

  return mapped.length > 0 ? mapped : undefined
}

type AddressField = SendEmailOptions['cc'] | SendEmailOptions['replyTo']

/**
 * Flatten nodemailer's `Address | string` forms to the plain strings Resend takes.
 *
 * Shared by `replyTo` and `cc`, which nodemailer types identically — and an
 * unmapped field is dropped in silence (`docs/rules/email.md`), so one helper is
 * what keeps the second one from being forgotten.
 *
 * nodemailer 10 made every `Address` field optional and admits nested arrays, so
 * an object carrying only a `name` or a `group` now type-checks. Such an entry is
 * dropped with a warning: nothing it carries can become a header string, and the
 * Resend 422 that used to surface the shape is gone.
 *
 * ⚠ Narrow on the object, never on `'address' in entry` — the shape the optional
 * field made expressible omits the key, so a key check drops it silently instead.
 */
function toAddressList(
  value: AddressField,
  onUnsupported: (name: string) => void,
): string[] | undefined {
  const addresses: string[] = []

  const take = (entry: AddressField): void => {
    if (Array.isArray(entry)) {
      entry.forEach(take)
      return
    }
    if (typeof entry === 'string') {
      addresses.push(entry)
      return
    }
    if (!entry) return

    const { address, name } = entry
    if (!address) {
      onUnsupported(name ?? 'unnamed')
      return
    }
    addresses.push(name ? `${headerDisplayName(name)} <${address}>` : address)
  }

  take(value)

  return addresses.length > 0 ? addresses : undefined
}

export const resendAdapter = (): EmailAdapter => {
  return ({ payload }) => {
    const apiKey = serverEnv.RESEND_API_KEY

    if (!apiKey) {
      payload.logger.warn({ msg: 'Resend API key not configured - email will not be sent' })
    }

    const resend = apiKey ? new Resend(apiKey) : null

    return {
      name: 'resend',
      // Payload composes these two into a `From` for its own auth mail only; a
      // `sendEmail` caller that omits `from` gets the bare address below. Both
      // audiences are managers, hence the manager sender. The display name is
      // derived so it cannot drift from the subject line `Managers.ts` builds
      // from the same brand.
      defaultFromAddress: MANAGER_EMAIL_FROM,
      defaultFromName: getEmailBrand().productName,

      async sendEmail(message) {
        // Every path below returns rather than throws — deliberately, because
        // `sendVerificationEmail` runs inside the manager-create transaction and
        // a throw would roll the account back. That non-fatal choice is also why
        // nothing reaches the Sentry plugin's `afterError` hook, so each failure
        // is reported here explicitly. Without this a delivery failure exists
        // only as a pino line: no Sentry issue, no admin-visible error (#320).
        //
        // ⚠ No part of the MESSAGE goes to Sentry — not the recipient, not the
        // subject. A `user-messages` send carries a viewer-authored subject, and
        // that collection is in `RESTRICTED_COLLECTIONS` precisely because it
        // holds personal data; copying it into a third-party error tracker would
        // widen where that data lives. The pino line beside each capture already
        // carries the detail, in the log system that is meant to hold it.
        if (!resend) {
          payload.logger.error({ msg: 'Cannot send email - Resend client not initialized' })
          Sentry.captureMessage('Email dropped: Resend client not initialized', { level: 'error' })
          return
        }

        try {
          const attachments = toResendAttachments(message.attachments, (filename) =>
            payload.logger.warn({
              msg: 'Resend adapter: dropping stream attachment (unsupported)',
              filename,
            }),
          )
          const replyTo = toAddressList(message.replyTo, (name) =>
            payload.logger.warn({
              msg: 'Resend adapter: dropping replyTo entry with no address',
              name,
            }),
          )
          const cc = toAddressList(message.cc, (name) =>
            payload.logger.warn({
              msg: 'Resend adapter: dropping cc entry with no address',
              name,
            }),
          )

          // Convert Payload's SendEmailOptions to Resend's format
          const { data, error } = await resend.emails.send({
            from: (message.from as string) || MANAGER_EMAIL_FROM,
            to: Array.isArray(message.to) ? (message.to as string[]) : [message.to as string],
            subject: message.subject as string,
            html: message.html as string,
            text: message.text as string,
            ...(replyTo && { replyTo }),
            ...(cc && { cc }),
            ...(attachments && { attachments }),
          })

          if (error) {
            payload.logger.error({
              msg: 'Resend API error',
              error: error.message,
              name: error.name,
            })
            Sentry.captureMessage('Email dropped: Resend API error', {
              level: 'error',
              extra: { error: error.message, name: error.name },
            })
            return
          }

          if (data) {
            payload.logger.info({ msg: 'Email sent successfully', messageId: data.id })
          }
        } catch (error) {
          payload.logger.error({
            msg: 'Email sending failed',
            error: error instanceof Error ? error.message : String(error),
          })
          Sentry.captureException(error)
        }
      },
    }
  }
}
