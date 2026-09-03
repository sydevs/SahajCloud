import type { Attachment as NodemailerAttachment } from 'nodemailer/lib/mailer'
import type { EmailAdapter, SendEmailOptions } from 'payload'
import type { CreateEmailOptions } from 'resend'

import * as Sentry from '@sentry/nextjs'
import { Resend } from 'resend'

import { CONTACT_EMAIL } from '@/lib/contact'
import { serverEnv } from '@/lib/env'

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

/**
 * Flatten nodemailer's `Address | string` forms to the plain strings Resend takes.
 */
function toAddressList(value: SendEmailOptions['replyTo']): string[] | undefined {
  const entries = (Array.isArray(value) ? value : [value]).flatMap((entry) => {
    if (typeof entry === 'string') return [entry]
    if (entry && typeof entry === 'object' && 'address' in entry) {
      return [entry.name ? `${entry.name} <${entry.address}>` : entry.address]
    }
    return []
  })

  return entries.length > 0 ? entries : undefined
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
      defaultFromAddress: CONTACT_EMAIL,
      defaultFromName: 'We Meditate Admin',

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
        // ⚠ Returning `{ ok: false }` on a drop is what lets a caller that CAN
        // act on the failure do so — `resendVerification` restores the previous
        // token rather than leaving a manager with a revoked link and no
        // replacement. It is a return value, not a throw, so the non-fatal
        // contract above is unchanged and every existing caller (all of which
        // ignore the result) behaves exactly as before. Only an explicit
        // `{ ok: false }` means "dropped": Payload's own console adapter, which
        // stands in wherever email is not configured, resolves `undefined`, and
        // that must keep reading as sent.
        if (!resend) {
          payload.logger.error({ msg: 'Cannot send email - Resend client not initialized' })
          Sentry.captureMessage('Email dropped: Resend client not initialized', { level: 'error' })
          return { ok: false as const, reason: 'not-initialized' as const }
        }

        try {
          const attachments = toResendAttachments(message.attachments, (filename) =>
            payload.logger.warn({
              msg: 'Resend adapter: dropping stream attachment (unsupported)',
              filename,
            }),
          )
          const replyTo = toAddressList(message.replyTo)

          // Convert Payload's SendEmailOptions to Resend's format
          const { data, error } = await resend.emails.send({
            from: (message.from as string) || CONTACT_EMAIL,
            to: Array.isArray(message.to) ? (message.to as string[]) : [message.to as string],
            subject: message.subject as string,
            html: message.html as string,
            text: message.text as string,
            ...(replyTo && { replyTo }),
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
            return { ok: false as const, reason: 'api-error' as const }
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
          return { ok: false as const, reason: 'threw' as const }
        }
      },
    }
  }
}
